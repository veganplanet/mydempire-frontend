let lastScroll = 0;

const navbar = document.querySelector(".appbar");

window.addEventListener("scroll", () => {

  const currentScroll = window.pageYOffset;

  if (currentScroll > lastScroll && currentScroll > 80) {
    navbar.classList.add("appbar-hidden");
  } else {
    navbar.classList.remove("appbar-hidden");
  }

  lastScroll = currentScroll;

});
