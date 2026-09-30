import assert from "node:assert/strict";
import test from "node:test";
import { advanceMappoolChatContext, createMappoolChatContext, parseMappoolMessage } from "../src/composables/useMappoolChat.js";

const slots = ["NM1", "NM2", "NM3", "NM4"];
const actions = (text, phase = "unknown") => parseMappoolMessage(text, slots, phase).slots.map(({ slotId, action }) => `${slotId}:${action}`);

test("groups list slots across punctuation", () => {
  assert.deepEqual(actions("ban nm1, nm2. nm3"), ["NM1:ban", "NM2:ban", "NM3:ban"]);
  assert.deepEqual(actions("ban nm1 nm2"), ["NM1:ban", "NM2:ban"]);
  assert.deepEqual(actions("забань nm1 и nm2"), ["NM1:ban", "NM2:ban"]);
});

test("recognizes Cyrillic category aliases for mappool slots", () => {
  assert.deepEqual(
    parseMappoolMessage("бань НМ1 и ФМ2", ["NM1", "FM2"], "unknown").slots.map(({ slotId, text, action }) => ({ slotId, text, action })),
    [
      { slotId: "NM1", text: "НМ1", action: "ban" },
      { slotId: "FM2", text: "ФМ2", action: "ban" },
    ],
  );
  assert.deepEqual(
    parseMappoolMessage("защити ХД3", ["HD3"], "unknown").slots.map(({ slotId, text, action }) => ({ slotId, text, action })),
    [{ slotId: "HD3", text: "ХД3", action: "protect" }],
  );
  assert.deepEqual(
    parseMappoolMessage("пикни ФМ1", ["FM1"], "unknown").slots.map(({ slotId, text, action }) => ({ slotId, text, action })),
    [{ slotId: "FM1", text: "ФМ1", action: "pick" }],
  );
  assert.deepEqual(
    parseMappoolMessage("пикни FM1", ["ФМ1"], "unknown").slots.map(({ slotId, text, action }) => ({ slotId, text, action })),
    [{ slotId: "ФМ1", text: "FM1", action: "pick" }],
  );
});

test("binds the nearest available verb to each group", () => {
  assert.deepEqual(actions("pick nm1 but ban nm2"), ["NM1:pick", "NM2:ban"]);
  assert.deepEqual(actions("NM1 ban NM2"), ["NM1:ban", "NM2:pick"]);
  assert.deepEqual(actions("keep NM1 pick NM2"), ["NM1:protect", "NM2:pick"]);
  assert.deepEqual(actions("lock in NM3"), ["NM3:pick"]);
  assert.deepEqual(actions("pick nm1 nm2 ban"), ["NM1:pick", "NM2:pick"]);
});

test("does not inherit actions across unrelated clauses", () => {
  assert.deepEqual(actions("I hate NM4, ban NM1"), ["NM4:pick", "NM1:ban"]);
  assert.deepEqual(actions("NM1, ban"), ["NM1:pick"]);
});

test("recognizes Russian action vocabulary", () => {
  assert.deepEqual(actions("забань nm1"), ["NM1:ban"]);
  assert.deepEqual(actions("защити nm2"), ["NM2:protect"]);
  assert.deepEqual(actions("пикни nm3"), ["NM3:pick"]);
  assert.deepEqual(actions("выбери nm4"), ["NM4:pick"]);
  assert.deepEqual(actions("убери nm1"), ["NM1:ban"]);
  assert.deepEqual(actions("оставь nm2"), ["NM2:protect"]);
});

test("recognizes Russian phase triggers", () => {
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "ваш бан" }), "opening-ban");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "фаза протектов" }), "opening-protect");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "начинаем пики" }), "pick");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "давайте банить" }), "opening-ban");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "давайте бан" }), "opening-ban");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "давайте протект" }), "opening-protect");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "протект" }), "opening-protect");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "давайте пикать" }), "pick");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "бань" }), "opening-ban");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "протекти" }), "opening-protect");
  assert.equal(advanceMappoolChatContext(createMappoolChatContext(), { text: "пикай" }), "pick");
});

test("keeps Russian phase transitions in order", () => {
  const context = createMappoolChatContext();
  advanceMappoolChatContext(context, { id: "1", text: "давайте банить" });
  assert.deepEqual(
    parseMappoolMessage("ФМ1", ["FM1"], context.phase).slots.map(({ slotId, action }) => `${slotId}:${action}`),
    ["FM1:ban"],
  );
  advanceMappoolChatContext(context, { id: "2", text: "давайте пикать" });
  assert.deepEqual(
    parseMappoolMessage("ФМ1", ["FM1"], context.phase).slots.map(({ slotId, action }) => `${slotId}:${action}`),
    ["FM1:pick"],
  );
  advanceMappoolChatContext(context, { id: "3", text: "давайте протектить" });
  assert.deepEqual(
    parseMappoolMessage("ФМ1", ["FM1"], context.phase).slots.map(({ slotId, action }) => `${slotId}:${action}`),
    ["FM1:protect"],
  );
});

test("phase changes are recorded per message and survive neutral countdown messages", () => {
  const context = createMappoolChatContext();
  advanceMappoolChatContext(context, { id: "1", text: "your ban was bad" });
  advanceMappoolChatContext(context, { id: "2", text: "Countdown ends in 10 seconds" });
  assert.equal(context.phaseAtMessage.get("1"), "opening-ban");
  assert.equal(context.phaseAtMessage.get("2"), "opening-ban");
  assert.deepEqual(actions("NM1", context.phaseAtMessage.get("2")), ["NM1:ban"]);
});

test("finished is terminal and produces no slots", () => {
  const context = createMappoolChatContext();
  advanceMappoolChatContext(context, { id: "1", text: "your ban" });
  advanceMappoolChatContext(context, { id: "2", text: "room closed" }, { roomClosed: true });
  advanceMappoolChatContext(context, { id: "3", text: "your pick" });
  assert.equal(context.phaseAtMessage.get("2"), "finished");
  assert.equal(context.phaseAtMessage.get("3"), "finished");
  assert.deepEqual(parseMappoolMessage("NM1", slots, context.phaseAtMessage.get("3")).slots, []);
});

test("contexts for separate lobbies do not share phases", () => {
  const first = createMappoolChatContext();
  const second = createMappoolChatContext();
  advanceMappoolChatContext(first, { id: "a", text: "your pick" });
  advanceMappoolChatContext(second, { id: "b", text: "your ban" });
  assert.deepEqual(actions("NM1", first.phase), ["NM1:pick"]);
  assert.deepEqual(actions("NM1", second.phase), ["NM1:ban"]);
});
