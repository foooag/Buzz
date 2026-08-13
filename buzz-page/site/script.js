const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-button");
const navLinks = document.querySelector(".nav-links");
const HAZEL_BASE_URL = "https://hazel-beta-two.vercel.app";

function detectDownloadPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const userAgent = navigator.userAgent || "";

  if (/mac/i.test(platform) || /macintosh|mac os x/i.test(userAgent)) {
    return { id: "darwin", label: "macOS" };
  }
  if (/win/i.test(platform) || /windows/i.test(userAgent)) {
    return { id: "win32", label: "Windows" };
  }
  if (/linux/i.test(platform) || (/linux/i.test(userAgent) && !/android/i.test(userAgent))) {
    return { id: "linux", label: "Linux" };
  }
  return null;
}

const downloadPlatform = detectDownloadPlatform();
const automaticDownloadUrl = downloadPlatform
  ? `${HAZEL_BASE_URL}/download/${downloadPlatform.id}`
  : `${HAZEL_BASE_URL}/download`;

document.querySelectorAll("[data-hazel-download]").forEach((link) => {
  link.href = automaticDownloadUrl;
  link.setAttribute(
    "aria-label",
    downloadPlatform ? `Download Buzz for ${downloadPlatform.label}` : "Download Buzz",
  );
});

document.querySelectorAll("[data-download-label]").forEach((link) => {
  const label = link.querySelector("span");
  if (label && downloadPlatform) label.textContent = `Download for ${downloadPlatform.label}`;
});

document.querySelectorAll("[data-hazel-platform]").forEach((link) => {
  link.classList.toggle("recommended", link.dataset.hazelPlatform === downloadPlatform?.id);
});

const detectedPlatformLabel = document.querySelector("[data-detected-platform]");
if (detectedPlatformLabel) {
  detectedPlatformLabel.textContent = downloadPlatform
    ? `${downloadPlatform.label} detected · served by Hazel`
    : "Choose a platform · served by Hazel";
}

function updateHeader() {
  header?.classList.toggle("scrolled", window.scrollY > 12);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  navLinks?.classList.toggle("open", !open);
});

navLinks?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton?.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("open");
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

const previewLines = {
  terminal: [
    '<div><span class="term-dim">Last login: Wed Aug 5 09:41:20</span></div>',
    '<div><span class="term-green">deploy@prod-api-01</span> <span class="term-blue">~/apps/buzz</span> <b>$</b></div>',
    '<div>$ git status --short</div>',
    '<div><span class="term-yellow">M</span>&nbsp; electron/domains/agent/agent-runtime.ts</div>',
    '<div><span class="term-green">deploy@prod-api-01</span> <span class="term-blue">~/apps/buzz</span> <b>$</b> pnpm test</div>',
    '<div><span class="term-dim">Tests 64 passed <span class="term-green">(64)</span></span></div>',
    '<div><span class="term-dim">Duration 2.18s</span></div>',
    '<div class="prompt"><span class="term-green">deploy@prod-api-01</span> <span class="term-blue">~/apps/buzz</span> <b>$</b><i></i></div>',
  ],
  agent: [
    '<div><span class="term-dim">Agent attached to prod-api-01</span></div>',
    '<div><span class="term-green">✓</span> Read-only inspection approved</div>',
    '<div><span class="term-blue">→</span> systemctl status buzz-api</div>',
    '<div><span class="term-green">● active (running)</span></div>',
    '<div><span class="term-blue">→</span> journalctl -u buzz-api -n 80</div>',
    '<div><span class="term-yellow">!</span> Restart followed deploy 8f42b1a</div>',
    '<div><span class="term-dim">No further restarts detected.</span></div>',
  ],
  sftp: [
    '<div><span class="term-dim">SFTP · prod-api-01:/var/www/buzz</span></div>',
    '<div>drwxr-xr-x&nbsp;&nbsp; deploy&nbsp; dist/</div>',
    '<div>drwxr-xr-x&nbsp;&nbsp; deploy&nbsp; releases/</div>',
    '<div>-rw-r--r--&nbsp;&nbsp; deploy&nbsp; package.json</div>',
    '<div>-rw-r--r--&nbsp;&nbsp; deploy&nbsp; ecosystem.config.js</div>',
    '<div><span class="term-green">Ready to transfer · conflict rules enabled</span></div>',
  ],
  forward: [
    '<div><span class="term-dim">PORT FORWARDING · prod-api-01</span></div>',
    '<div><span class="term-green">●</span> localhost:5433 → 127.0.0.1:5432</div>',
    '<div><span class="term-green">●</span> localhost:6380 → 127.0.0.1:6379</div>',
    '<div><span class="term-dim">2 rules active · traffic encrypted over SSH</span></div>',
  ],
};

const terminalContent = document.querySelector("[data-terminal-content]");
document.querySelectorAll("[data-preview]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-preview]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    if (terminalContent) terminalContent.innerHTML = previewLines[button.dataset.preview].join("");
  });
});

document.querySelectorAll("[data-install-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.installTab;
    document.querySelectorAll("[data-install-tab]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-install-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.installPanel !== tab;
    });
  });
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select command";
    }
    window.setTimeout(() => { button.textContent = original; }, 1600);
  });
});

const year = document.querySelector("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());
