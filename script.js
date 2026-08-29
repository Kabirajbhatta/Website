document.documentElement.classList.add("js");

const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = [...document.querySelectorAll("[data-nav] a[href^='#']")];
const sections = [...document.querySelectorAll("main section[id]")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setMenu(open) {
  if (!nav || !navToggle) return;

  nav.classList.toggle("is-open", open);
  header?.classList.toggle("menu-active", open);
  document.body.classList.toggle("nav-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

navToggle?.addEventListener("click", () => {
  const open = navToggle.getAttribute("aria-expanded") !== "true";
  setMenu(open);
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
    if (scheduleDialog?.open && typeof scheduleDialog.close !== "function") {
      closeScheduleDialog();
    }
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth >= 900) setMenu(false);
});

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const revealElements = [...document.querySelectorAll(".reveal")];

revealElements.forEach((element) => {
  const delay = element.getAttribute("data-delay");
  if (delay) element.style.setProperty("--delay", `${delay}ms`);
});

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -5% 0px" }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        navLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${entry.target.id}`;
          link.classList.toggle("active", active);
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
  );

  sections.forEach((section) => sectionObserver.observe(section));
}

const year = document.querySelector("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());

const scheduleDialog = document.querySelector("[data-booking-dialog]");
const bookingClose = document.querySelector(".booking-close");
const scheduleOpeners = [...document.querySelectorAll("[data-schedule-open]")];
const scheduleClosers = [...document.querySelectorAll("[data-schedule-close]")];
const bookingForm = document.querySelector("[data-booking-form]");
const bookingStatus = document.querySelector("[data-booking-status]");
const bookingSuccess = document.querySelector("[data-booking-success]");
const bookingSuccessMessage = document.querySelector("[data-booking-success-message]");
const bookingSuccessTitle = document.querySelector("#booking-success-title");
const bookingSubmit = document.querySelector("[data-booking-submit]");
const bookingSubmitLabel = document.querySelector("[data-booking-submit-label]");
const meetingDate = document.querySelector("[data-meeting-date]");
const meetingTime = document.querySelector("[data-meeting-time]");
let lastScheduleOpener = null;

function getSydneyNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function updateMeetingMinimums() {
  if (!meetingDate || !meetingTime) return;

  const sydneyNow = getSydneyNow();
  meetingDate.min = sydneyNow.date;
  if (meetingDate.value === sydneyNow.date) meetingTime.min = sydneyNow.time;
  else meetingTime.removeAttribute("min");
}

function validateMeetingDateTime() {
  if (!meetingDate || !meetingTime) return true;

  const sydneyNow = getSydneyNow();
  meetingDate.setCustomValidity("");
  meetingTime.setCustomValidity("");

  if (meetingDate.value && meetingDate.value < sydneyNow.date) {
    meetingDate.setCustomValidity("Choose today or a future date in Australia/Sydney.");
    return false;
  }

  if (
    meetingDate.value === sydneyNow.date &&
    meetingTime.value &&
    meetingTime.value <= sydneyNow.time
  ) {
    meetingTime.setCustomValidity("Choose a future time in Australia/Sydney.");
    return false;
  }

  return true;
}

function resetBookingView() {
  if (!bookingForm || !bookingSuccess) return;

  bookingForm.hidden = false;
  bookingSuccess.hidden = true;
  if (bookingStatus) bookingStatus.textContent = "";
  updateMeetingMinimums();
}

function openScheduleDialog(event) {
  if (!scheduleDialog) return;

  lastScheduleOpener = event?.currentTarget || document.activeElement;
  setMenu(false);
  resetBookingView();

  if (typeof scheduleDialog.showModal === "function") scheduleDialog.showModal();
  else scheduleDialog.setAttribute("open", "");

  document.body.classList.add("dialog-open");
  requestAnimationFrame(() => bookingClose?.focus({ preventScroll: true }));
}

function closeScheduleDialog() {
  if (!scheduleDialog) return;

  if (typeof scheduleDialog.close === "function" && scheduleDialog.open) scheduleDialog.close();
  else scheduleDialog.removeAttribute("open");

  document.body.classList.remove("dialog-open");
  if (lastScheduleOpener instanceof HTMLElement) lastScheduleOpener.focus();
}

function setBookingPending(pending) {
  if (bookingSubmit) bookingSubmit.disabled = pending;
  if (bookingForm) bookingForm.setAttribute("aria-busy", String(pending));
  if (bookingSubmitLabel) {
    bookingSubmitLabel.textContent = pending ? "Sending request…" : "Send meeting request";
  }
}

scheduleOpeners.forEach((button) => button.addEventListener("click", openScheduleDialog));
scheduleClosers.forEach((button) => button.addEventListener("click", closeScheduleDialog));

scheduleDialog?.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
});

scheduleDialog?.addEventListener("click", (event) => {
  if (event.target !== scheduleDialog) return;

  const bounds = scheduleDialog.getBoundingClientRect();
  const inside =
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom;
  if (!inside) closeScheduleDialog();
});

meetingDate?.addEventListener("input", () => {
  updateMeetingMinimums();
  validateMeetingDateTime();
});
meetingTime?.addEventListener("input", validateMeetingDateTime);
updateMeetingMinimums();

bookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateMeetingDateTime() || !bookingForm.checkValidity()) {
    bookingForm.reportValidity();
    return;
  }

  const formData = new FormData(bookingForm);
  const payload = {
    fullName: String(formData.get("fullName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    date: String(formData.get("date") || ""),
    time: String(formData.get("time") || ""),
    meetingType: String(formData.get("meetingType") || ""),
    message: String(formData.get("message") || ""),
    website: String(formData.get("website") || ""),
  };

  setBookingPending(true);
  if (bookingStatus) bookingStatus.textContent = "";

  try {
    const response = await fetch("/api/meetings", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Your request could not be sent. Please try again.");
    }

    bookingForm.reset();
    bookingForm.hidden = true;
    if (bookingSuccess) bookingSuccess.hidden = false;
    if (bookingSuccessMessage) bookingSuccessMessage.textContent = result.message;
    bookingSuccessTitle?.focus();
  } catch (error) {
    if (bookingStatus) {
      bookingStatus.textContent = error instanceof Error
        ? error.message
        : "Your request could not be sent. Please try again.";
    }
  } finally {
    setBookingPending(false);
    updateMeetingMinimums();
  }
});
