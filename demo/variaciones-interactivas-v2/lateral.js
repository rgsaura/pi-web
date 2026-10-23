/* Interactividad del lateral (variaciones B y C): fijar / desfijar.
   Mueve la fila entre bloques y alterna el estado del pin. */
(function () {
  "use strict";

  // Los iconos reales de la app (components/SidebarIcons.tsx: PinIcon / PinOffIcon).
  var PIN_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
  var PINOFF_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M15 9.3V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8.5"/><path d="m2 2 20 20"/><path d="M9 9v1.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h11"/></svg>';

  function togglePin(host, btn) {
    var row = btn.closest("[data-pinnable]");
    if (!row) return;
    var isPinned = row.parentElement.getAttribute("data-pin-slot") === "fijo";
    var target = isPinned ? host.querySelector('[data-pin-slot="temporal"], [data-pin-slot="catalogo"]') : host.querySelector('[data-pin-slot="fijo"]');
    if (!target) return;
    target.appendChild(row);
    var pin = row.querySelector(".pin-btn");
    if (pin) {
      pin.classList.toggle("is-pinned", !isPinned);
      pin.innerHTML = isPinned ? PIN_SVG : PINOFF_SVG;
      pin.title = isPinned ? "Fijar" : "Desfijar";
      pin.setAttribute("aria-label", (isPinned ? "Fijar " : "Desfijar ") + (row.querySelector(".lbl") || {}).textContent);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-lateral]"), function (host) {
      host.addEventListener("click", function (e) {
        var pin = e.target.closest(".pin-btn");
        if (pin && host.contains(pin)) {
          e.stopPropagation();
          togglePin(host, pin);
        }
      });
      host.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var pin = e.target.closest(".pin-btn");
        if (pin && host.contains(pin)) {
          e.preventDefault();
          togglePin(host, pin);
        }
      });
    });
  });
})();
