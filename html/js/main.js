(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const softMotion = window.matchMedia("(max-width: 919px)").matches;
  const nav = document.querySelector("[data-nav]");
  const progress = document.querySelector("[data-progress]");
  const scrollHint = document.querySelector("[data-scroll-hint]");

  let hintDismissed = false;

  const dismissScrollHint = () => {
    if (hintDismissed || !scrollHint) return;
    hintDismissed = true;
    scrollHint.classList.remove("is-visible");
    scrollHint.classList.add("is-gone");
    window.setTimeout(() => {
      scrollHint.remove();
    }, 480);
  };

  const onScrollChrome = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    if (progress) progress.style.width = `${ratio * 100}%`;
    nav?.classList.toggle("is-scrolled", window.scrollY > 24);
    if (window.scrollY > 28) dismissScrollHint();
  };

  window.addEventListener("scroll", onScrollChrome, { passive: true });
  onScrollChrome();

  if (!reduce && scrollHint) {
    window.setTimeout(() => {
      if (!hintDismissed) scrollHint.classList.add("is-visible");
    }, softMotion ? 900 : 1200);

    // 几次提示后自动消失，不一直占着
    window.setTimeout(dismissScrollHint, softMotion ? 7000 : 8500);

    scrollHint.addEventListener("click", (event) => {
      const next = document.querySelector("#insight");
      if (!next) return;
      event.preventDefault();
      dismissScrollHint();
      next.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } else if (scrollHint) {
    scrollHint.remove();
  }

  const infoModal = document.querySelector("[data-info-modal]");
  const infoBackdrop = infoModal?.querySelector(".info-modal__backdrop");
  const infoPanel = infoModal?.querySelector(".info-modal__panel");
  const infoTitle = infoModal?.querySelector(".info-modal__title");
  const infoBody = infoModal?.querySelector("[data-info-body]");
  const infoCloseBtn = infoModal?.querySelector(".info-modal__close");

  const INFO_CONTENT = {
    principle: {
      title: "原理说明",
      html: `
        <p class="info-modal__seg info-modal__intro">进入准备界面后，应用会自动读取对局信息并展示双方数据。完美与 5E 的读取方式不同，但都只拿客户端侧信息，不碰 CS2 游戏本身。</p>
        <div class="info-modal__seg info-modal__columns info-modal__columns--split">
          <div class="info-modal__col">
            <p class="info-modal__col-name">完美对战平台</p>
            <p class="info-modal__col-text">匹配成功时，完美客户端会把建房、地图、选手名单等信息写进本机日志。本应用监听这些日志文件，解析后整理成你看到的数据面板，全程无需手动刷新。</p>
          </div>
          <div class="info-modal__col">
            <p class="info-modal__col-name">5E 对战平台</p>
            <p class="info-modal__col-text">需从本应用内启动 5E。应用会读取 5E 客户端内部页面里的对局与选手数据，再补全地图、赛季等信息，同样在准备阶段自动展示。</p>
          </div>
        </div>
        <p class="info-modal__seg info-modal__note">两种方式都不会读取游戏内存，也不会注入 CS2 进程。</p>
      `,
    },
    safety: {
      title: "为何安全",
      html: `
        <div class="info-modal__seg info-modal__prose">
          <p>急停助手只监听本机键盘——方向键、蹲键和开火键何时按下，再结合内置的移速模型，判断你是否停稳、急停时机是否合适。</p>
          <p>它不读取 CS2 内存，不向游戏注入代码，也不修改任何游戏文件。所有计算都在本机完成，和作弊工具不是一类东西。</p>
        </div>
        <p class="info-modal__seg info-modal__note">若提示需要管理员权限，是因为 Windows 要求这样才能监听全局键盘，与作弊无关。</p>
      `,
    },
  };

  let infoTrigger = null;
  let infoAnimating = false;

  const infoSegments = () => infoPanel?.querySelectorAll(".info-modal__seg") ?? [];

  const renderInfoContent = (content) => {
    if (!infoTitle || !infoBody) return;
    infoTitle.textContent = content.title;
    infoBody.innerHTML = content.html;
  };

  const resetInfoMotion = () => {
    if (!infoBackdrop || !infoPanel) return;
    if (typeof gsap !== "undefined") {
      gsap.set(infoBackdrop, { opacity: 0 });
      gsap.set(infoPanel, { opacity: 0, y: 18, scale: 0.97, filter: "blur(8px)" });
      gsap.set(infoSegments(), { opacity: 0, y: 8 });
    }
  };

  const closeInfoModal = () => {
    if (!infoModal || infoModal.hidden || infoAnimating) return;

    const finish = () => {
      infoModal.hidden = true;
      infoModal.classList.remove("is-open");
      document.body.style.overflow = "";
      resetInfoMotion();
      infoAnimating = false;
      if (infoTrigger) {
        infoTrigger.focus();
        infoTrigger = null;
      }
    };

    if (reduce || typeof gsap === "undefined" || !infoBackdrop || !infoPanel) {
      finish();
      return;
    }

    infoAnimating = true;
    const segs = infoSegments();

    gsap
      .timeline({
        defaults: { ease: "power2.in" },
        onComplete: finish,
      })
      .to(segs, { opacity: 0, y: 4, duration: 0.16, stagger: 0.025 }, 0)
      .to(
        infoPanel,
        { opacity: 0, y: 12, scale: 0.98, filter: "blur(4px)", duration: 0.26 },
        0.05
      )
      .to(infoBackdrop, { opacity: 0, duration: 0.26 }, 0.08);
  };

  const openInfoModal = (key, trigger) => {
    const content = INFO_CONTENT[key];
    if (!content || !infoModal || infoAnimating) return;

    infoTrigger = trigger;
    renderInfoContent(content);
    infoModal.hidden = false;
    infoModal.classList.add("is-open");
    document.body.style.overflow = "hidden";

    if (reduce || typeof gsap === "undefined" || !infoBackdrop || !infoPanel) {
      if (infoBackdrop) infoBackdrop.style.opacity = "1";
      if (infoPanel) {
        infoPanel.style.opacity = "1";
        infoPanel.style.transform = "none";
        infoPanel.style.filter = "none";
      }
      infoSegments().forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      infoCloseBtn?.focus();
      return;
    }

    infoAnimating = true;
    const segs = infoSegments();

    gsap.set(infoBackdrop, { opacity: 0 });
    gsap.set(infoPanel, { opacity: 0, y: softMotion ? 40 : 22, scale: 0.96, filter: "blur(8px)" });
    gsap.set(segs, { opacity: 0, y: 10 });

    gsap
      .timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          infoAnimating = false;
          infoCloseBtn?.focus();
        },
      })
      .to(infoBackdrop, { opacity: 1, duration: 0.36 }, 0)
      .to(
        infoPanel,
        { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.48 },
        0.04
      )
      .to(segs, { opacity: 1, y: 0, duration: 0.38, stagger: 0.08, ease: "power2.out" }, 0.16);
  };

  document.querySelectorAll("[data-info]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openInfoModal(btn.getAttribute("data-info"), btn);
    });
  });

  infoModal?.querySelectorAll("[data-info-close]").forEach((el) => {
    el.addEventListener("click", closeInfoModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInfoModal();
  });

  if (reduce || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    document.querySelectorAll("[data-a]").forEach((el) => {
      el.style.opacity = "1";
    });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  const easeOut = "power3.out";

  const fromOf = (el) => {
    const type = el.getAttribute("data-a") || "fade-up";
    const map = softMotion
      ? {
          "fade-up": { y: 28, opacity: 0 },
          "fade-right": { y: 24, opacity: 0 },
          "fade-left": { y: 24, opacity: 0 },
          "zoom-in": { y: 20, opacity: 0 },
          "zoom-soft": { y: 28, opacity: 0 },
          "rise-scale": { y: 28, opacity: 0 },
          "rise-pop": { y: 48, scale: 0.9, rotate: 4, opacity: 0, transformOrigin: "50% 100%" },
          "wipe-in": { y: 24, opacity: 0 },
        }
      : {
          "fade-up": { y: 56, opacity: 0, filter: "blur(10px)" },
          "fade-right": { x: -64, opacity: 0, filter: "blur(8px)" },
          "fade-left": { x: 80, opacity: 0, filter: "blur(8px)" },
          "zoom-in": { scale: 0.9, opacity: 0, filter: "blur(10px)" },
          "zoom-soft": { scale: 0.84, y: 48, opacity: 0, filter: "blur(12px)" },
          "rise-scale": { scale: 1.1, y: 72, opacity: 0 },
          "rise-pop": {
            y: 72,
            scale: 0.9,
            rotate: -6,
            opacity: 0,
            filter: "blur(6px)",
            transformOrigin: "50% 100%",
          },
          "wipe-in": { clipPath: "inset(0 55% 0 0)", opacity: 0.35, x: -28 },
        };
    return map[type] || map["fade-up"];
  };

  const toState = {
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    opacity: 1,
    filter: "blur(0px)",
    clipPath: "inset(0 0% 0 0)",
  };

  // 每屏一条时间轴：滚入时错落播放，离开可倒放
  document.querySelectorAll("[data-scene]").forEach((scene, sceneIndex) => {
    const nodes = [...scene.querySelectorAll("[data-a]")];
    if (!nodes.length) return;

    nodes.forEach((el) => gsap.set(el, fromOf(el)));

    const tl = gsap.timeline({
      paused: sceneIndex !== 0,
      defaults: { duration: softMotion ? 0.72 : 1.05, ease: easeOut },
      scrollTrigger:
        sceneIndex === 0
          ? null
          : {
              trigger: scene,
              start: softMotion ? "top 82%" : "top 70%",
              end: "bottom 35%",
              toggleActions: "play none none reverse",
            },
    });

    nodes.forEach((el, i) => {
      const extra = Number(el.getAttribute("data-d") || 0) / 1000;
      const stagger = softMotion ? 0.06 : 0.1;
      const type = el.getAttribute("data-a");
      const at = i * stagger + extra * (softMotion ? 0.2 : 0.35);

      if (type === "rise-pop") {
        tl.to(
          el,
          {
            ...toState,
            duration: softMotion ? 0.92 : 1.12,
            ease: "power2.out",
          },
          at
        );
        return;
      }

      tl.to(el, { ...toState }, at);
    });

    if (sceneIndex === 0) {
      tl.delay(softMotion ? 0.06 : 0.12);
      tl.play();
    }
  });
})();
