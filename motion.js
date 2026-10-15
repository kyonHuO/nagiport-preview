(function () {
  "use strict";
  document.documentElement.classList.add("js");
  var nodes = document.querySelectorAll(".reveal");
  if (!nodes.length) return;
  if (!("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(nodes, function (n) {
      n.classList.add("is-visible");
    });
    return;
  }
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  Array.prototype.forEach.call(nodes, function (n) {
    io.observe(n);
  });
})();
