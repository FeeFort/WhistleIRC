import msvcrt
import queue
import socket
import sys
import time
import threading


IRC_HOST = "irc.ppy.sh"
IRC_PORT = 6667
IRC_NICK = "FeeFort"
IRC_TOKEN = "273cb5a7"
PROMPT = "irc> "
CLEAR_LINE = "\r\033[2K"


class RawBanchoClient:
    def __init__(self):
        self.socket = None
        self.send_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.events = queue.Queue()
        self.history = []
        self.filter_lock = threading.Lock()
        self.filtered_types = {"QUIT", "JOIN", "PART"}

    def connect(self):
        if not IRC_NICK or IRC_NICK == "PASTE_OSU_USERNAME_HERE":
            raise ValueError("Set IRC_NICK at the top of the script first.")
        if not IRC_TOKEN or IRC_TOKEN == "PASTE_IRC_TOKEN_HERE":
            raise ValueError("Set IRC_TOKEN at the top of the script first.")

        nick = IRC_NICK.replace(" ", "_")
        self.socket = socket.create_connection((IRC_HOST, IRC_PORT), timeout=15)
        self.socket.settimeout(1.0)
        self.events.put(f"Connected to {IRC_HOST}:{IRC_PORT}")

        self.send_line(f"PASS {IRC_TOKEN}")
        self.send_line(f"NICK {nick}")
        self.send_line(f"USER {nick} 0 * :{nick}")

        threading.Thread(target=self.read_loop, daemon=True).start()

    def send_line(self, line, show=True):
        if not self.socket:
            return
        message = f"{line}\r\n"
        try:
            payload = message.encode("utf-8")
        except UnicodeEncodeError:
            payload = message.encode("latin-1")
        with self.send_lock:
            self.socket.sendall(payload)
        if show:
            self.events.put(f"> {line}")

    def read_loop(self):
        buffer = ""

        while not self.stop_event.is_set():
            try:
                data = self.socket.recv(4096)
            except socket.timeout:
                continue
            except OSError as error:
                if not self.stop_event.is_set():
                    self.events.put(f"Read error: {error}")
                break

            if not data:
                self.events.put("Server closed the connection.")
                self.stop_event.set()
                break

            buffer += data.decode("utf-8", errors="replace")
            while "\n" in buffer:
                raw_line, buffer = buffer.split("\n", 1)
                line = raw_line.rstrip("\r")

                if line.startswith("PING"):
                    payload = line[4:].lstrip()
                    self.send_line(f"PONG {payload}" if payload else "PONG")

                if not self.should_filter(line):
                    self.events.put(f"< {line}")

    def should_filter(self, line):
        tokens = line.split()
        if len(tokens) < 2:
            return False
        with self.filter_lock:
            return tokens[1].upper() in self.filtered_types

    def filter_status(self):
        with self.filter_lock:
            filtered_types = sorted(self.filtered_types)
        if not filtered_types:
            return "Filter is off."
        return f"Filter hides: {', '.join(filtered_types)}"

    def handle_local_command(self, command):
        if not command.startswith("/"):
            return False

        parts = command.split(None, 1)
        if parts[0].lower() != "/filter":
            self.events.put(f"Unknown local command: {parts[0]}")
            return True

        if len(parts) == 1:
            self.events.put(self.filter_status())
            return True

        argument = parts[1].strip()
        if argument.lower() == "off":
            with self.filter_lock:
                self.filtered_types.clear()
            self.events.put("Filter disabled.")
            return True

        filtered_types = {
            item.upper()
            for item in argument.replace(",", " ").split()
            if item
        }
        if not filtered_types:
            self.events.put("Usage: /filter quit,join,part or /filter off")
            return True

        with self.filter_lock:
            self.filtered_types = filtered_types
        self.events.put(self.filter_status())
        return True

    def render_events(self, command_buffer):
        events = []
        while True:
            try:
                events.append(self.events.get_nowait())
            except queue.Empty:
                break

        if not events:
            return

        sys.stdout.write(CLEAR_LINE)
        sys.stdout.write("\n".join(events))
        sys.stdout.write(f"\n{PROMPT}{command_buffer}")
        sys.stdout.flush()

    def read_command(self):
        command_buffer = ""
        history_index = len(self.history)
        sys.stdout.write(PROMPT)
        sys.stdout.flush()

        while not self.stop_event.is_set():
            self.render_events(command_buffer)
            if not msvcrt.kbhit():
                time.sleep(0.05)
                continue

            char = msvcrt.getwch()
            if char in ("\x00", "\xe0"):
                key = msvcrt.getwch()
                if key == "H" and self.history:
                    history_index = max(0, history_index - 1)
                    command_buffer = self.history[history_index]
                    sys.stdout.write(f"{CLEAR_LINE}{PROMPT}{command_buffer}")
                    sys.stdout.flush()
                elif key == "P" and history_index < len(self.history):
                    history_index += 1
                    command_buffer = (
                        self.history[history_index]
                        if history_index < len(self.history)
                        else ""
                    )
                    sys.stdout.write(f"{CLEAR_LINE}{PROMPT}{command_buffer}")
                    sys.stdout.flush()
                continue
            if char == "\x03":
                raise KeyboardInterrupt
            if char in ("\r", "\n"):
                sys.stdout.write("\n")
                sys.stdout.flush()
                if command_buffer and (
                    not self.history or self.history[-1] != command_buffer
                ):
                    self.history.append(command_buffer)
                return command_buffer
            if char == "\b":
                if command_buffer:
                    command_buffer = command_buffer[:-1]
                    sys.stdout.write("\b \b")
                    sys.stdout.flush()
                continue
            if char.isprintable():
                command_buffer += char
                sys.stdout.write(char)
                sys.stdout.flush()

        self.render_events(command_buffer)
        return None

    def close(self):
        self.stop_event.set()
        if not self.socket:
            return
        try:
            self.socket.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.socket.close()
        self.socket = None


def main():
    client = RawBanchoClient()

    try:
        client.connect()
        client.events.put("Type raw IRC commands and press Enter. Press Ctrl+C to exit.")
        client.events.put(client.filter_status())
        while not client.stop_event.is_set():
            command = client.read_command()
            if command is None:
                break
            if command:
                if not client.handle_local_command(command):
                    client.send_line(command, show=False)
    except KeyboardInterrupt:
        sys.stdout.write("\nStopping...\n")
    except (OSError, ValueError) as error:
        sys.stderr.write(f"Error: {error}\n")
        return 1
    finally:
        client.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
