const SHOW_DELAY = 350;
const FADE_DURATION = 130;
const GAP = 9;

function contentFrom(binding) {
  return typeof binding.value === "object" && binding.value ? binding.value.value : binding.value;
}

function positionFrom(binding) {
  return Object.keys(binding.modifiers).find((modifier) => ["top", "bottom", "left", "right"].includes(modifier)) || "top";
}

function placeTooltip(target, tooltip, position) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = rect.left + (rect.width - tooltipRect.width) / 2;
  let top = rect.top - tooltipRect.height - GAP;

  if (position === "bottom") top = rect.bottom + GAP;
  if (position === "left") {
    left = rect.left - tooltipRect.width - GAP;
    top = rect.top + (rect.height - tooltipRect.height) / 2;
  }
  if (position === "right") {
    left = rect.right + GAP;
    top = rect.top + (rect.height - tooltipRect.height) / 2;
  }

  tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8))}px`;
  tooltip.dataset.position = position;
}

function removeTooltip(target) {
  const state = target.__appTooltip;
  if (!state) return;
  window.clearTimeout(state.showTimer);
  const tooltip = state.element;
  state.element = null;
  if (!tooltip) return;
  tooltip.classList.remove("app-tooltip--visible");
  window.setTimeout(() => tooltip.remove(), FADE_DURATION);
}

function showTooltip(target) {
  const state = target.__appTooltip;
  const content = String(contentFrom(state?.binding) || "").trim();
  if (!state || !content || target.disabled) return;
  window.clearTimeout(state.showTimer);
  state.showTimer = window.setTimeout(() => {
    if (state.element || target.disabled) return;
    const tooltip = document.createElement("div");
    tooltip.className = "app-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = content;
    document.body.appendChild(tooltip);
    state.element = tooltip;
    placeTooltip(target, tooltip, positionFrom(state.binding));
    requestAnimationFrame(() => tooltip.classList.add("app-tooltip--visible"));
  }, SHOW_DELAY);
}

export default {
  mounted(target, binding) {
    const show = () => showTooltip(target);
    const hide = () => removeTooltip(target);
    target.__appTooltip = { element: null, showTimer: null, show, hide, binding };
    target.addEventListener("mouseenter", show);
    target.addEventListener("mouseleave", hide);
    target.addEventListener("focus", show);
    target.addEventListener("blur", hide);
  },
  updated(target, binding) {
    target.__appTooltip.binding = binding;
    if (!contentFrom(binding)) removeTooltip(target);
  },
  unmounted(target) {
    const state = target.__appTooltip;
    if (!state) return;
    target.removeEventListener("mouseenter", state.show);
    target.removeEventListener("mouseleave", state.hide);
    target.removeEventListener("focus", state.show);
    target.removeEventListener("blur", state.hide);
    removeTooltip(target);
    delete target.__appTooltip;
  },
};
