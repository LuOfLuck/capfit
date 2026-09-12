/**
 * js/utils/dom.js
 * Helpers mínimos para manipulación y selección del DOM.
 */

function $(selector, context = document) {
  return context.querySelector(selector);
}

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

function show(element) {
  if (!element) return;
  element.style.display = '';
}

function hide(element) {
  if (!element) return;
  element.style.display = 'none';
}

function setContent(element, htmlOrText, isHtml = false) {
  if (!element) return;
  if (isHtml) element.innerHTML = htmlOrText;
  else element.textContent = htmlOrText;
}

window.$ = $;
window.$$ = $$;
window.DOM = { $, $$, show, hide, setContent };
