(() => {
  const root = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");
  const startButton = document.getElementById("startButton");
  const homeView = document.getElementById("homeView");
  const categoriesView = document.getElementById("categoriesView");
  const detailView = document.getElementById("detailView");
  const aboutView = document.getElementById("aboutView");
  const aboutBackButton = document.getElementById("aboutBackButton");
  const backButton = document.getElementById("backButton");
  const categoriesBackButton = document.getElementById("categoriesBackButton");
  const brandHome = document.getElementById("brandHome");
  const categoryCards = document.querySelectorAll(".category-card");

  const API_BASE = "https://nelocker.com/api/v1/prompts?sort=top&limit=50";
  const PROMPT_CACHE_KEY = "opl-prompts-cache-v4";
  const PROMPT_CACHE_TTL = 6 * 60 * 60 * 1000; // Keep the same library for 6 hours.
  let promptsCache = null;
  let promptsPromise = null;
  let activeCategory = "image";

  const categories = {
    image: { title: "تصویر و طراحی", description: "پرامپت‌هایی برای ساخت تصویر، لوگو، پوستر و ایده‌های بصری.", icon: "✳", number: "01", terms: ["image", "design", "art", "logo", "photo", "visual", "illustration", "تصویر", "طراحی"] },
    coding: { title: "برنامه‌نویسی", description: "پرامپت‌هایی برای نوشتن کد، رفع خطا و ساخت پروژه‌های وب.", icon: "⌘", number: "02", terms: ["code", "coding", "programming", "developer", "javascript", "python", "html", "css", "debug", "برنامه‌نویسی", "کد"] },
    writing: { title: "نوشتن و محتوا", description: "پرامپت‌هایی برای کپشن، مقاله، داستان و ایده‌های محتوا.", icon: "Aa", number: "03", terms: ["writing", "write", "content", "story", "article", "blog", "copywriting", "caption", "نوشتن", "محتوا", "داستان"] },
    study: { title: "درس و یادگیری", description: "پرامپت‌هایی برای یادگیری ساده‌تر، تمرین و خلاصه‌سازی.", icon: "⌁", number: "04", terms: ["study", "learn", "education", "teacher", "student", "explain", "tutor", "درس", "یادگیری", "آموزش"] },
    business: { title: "کسب‌وکار", description: "پرامپت‌هایی برای ایده‌پردازی، برنامه‌ریزی و تحقیق بازار.", icon: "↗", number: "05", terms: ["business", "marketing", "sales", "startup", "customer", "market", "entrepreneur", "کسب‌وکار", "بازاریابی"] },
    social: { title: "شبکه‌های اجتماعی", description: "پرامپت‌هایی برای ایدهٔ پست، سناریو و تقویم محتوا.", icon: "◎", number: "06", terms: ["social media", "instagram", "tiktok", "youtube", "post", "hashtag", "influencer", "شبکه اجتماعی", "اینستاگرام"] },
    productivity: { title: "بهره‌وری و برنامه‌ریزی", description: "پرامپت‌هایی برای مدیریت زمان، هدف‌ها و کارهای روزانه.", icon: "◷", number: "07", terms: ["productivity", "planning", "plan", "time management", "goal", "workflow", "organize", "بهره‌وری", "برنامه‌ریزی"] },
    gaming: { title: "بازی و سرگرمی", description: "پرامپت‌هایی برای طراحی بازی، شخصیت‌پردازی و ایده‌های سرگرم‌کننده.", icon: "⌁", number: "08", terms: ["game", "gaming", "character", "roleplay", "fun", "game design", "بازی", "سرگرمی"] },
    data: { title: "داده و تحلیل", description: "پرامپت‌هایی برای مرتب‌کردن اطلاعات، تحلیل و گزارش‌نویسی.", icon: "▦", number: "09", terms: ["data", "analysis", "analytics", "research", "statistics", "spreadsheet", "report", "داده", "تحلیل"] }
  };

  function setTheme(theme) {
    root.dataset.theme = theme;
    themeLabel.textContent = theme.toUpperCase();
    themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#050b12" : "#eaf6ff");
    try { localStorage.setItem("opl-theme", theme); } catch (_) {}
  }

  let savedTheme = "light";
  try { savedTheme = localStorage.getItem("opl-theme") || "light"; } catch (_) {}
  setTheme(savedTheme === "dark" ? "dark" : "light");

  themeToggle.addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  function showView(view) {
    homeView.classList.toggle("hidden", view !== "home");
    categoriesView.classList.toggle("hidden", view !== "categories");
    detailView.classList.toggle("hidden", view !== "detail");
    aboutView.classList.toggle("hidden", view !== "about");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ensurePromptArea() {
    const card = detailView.querySelector(".detail-card");
    let area = document.getElementById("promptResults");
    if (!area) {
      area = document.createElement("div");
      area.id = "promptResults";
      area.className = "prompt-results";
      card.appendChild(area);
    }
    return area;
  }

  function extractPrompts(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.prompts)) return payload.prompts;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  async function getPrompts() {
    if (promptsCache) return promptsCache;
    if (!promptsPromise) {
      promptsPromise = (async () => {
        // Reuse the same fetched library between visits so the category counts
        // don't jump around whenever the live API changes its newest items.
        try {
          const saved = JSON.parse(localStorage.getItem(PROMPT_CACHE_KEY) || "null");
          if (saved && Array.isArray(saved.items) && Date.now() - saved.savedAt < PROMPT_CACHE_TTL) {
            promptsCache = saved.items;
            return promptsCache;
          }
        } catch (_) {}

        const all = [];
        let page = 1;
        let hasMore = true;
        // Load pages from the API instead of silently limiting the library to page 1.
        while (hasMore && page <= 20) {
          const url = `${API_BASE}&page=${page}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error("HTTP " + response.status);
          const payload = await response.json();
          const items = extractPrompts(payload);
          if (!items.length) break;
          all.push(...items);
          hasMore = payload.has_more === true;
          page += 1;
        }
        if (!all.length) throw new Error("API response shape not recognized");
        // Remove duplicate records defensively, then sort by stable ID/title.
        const unique = new Map();
        for (const item of all) {
          const key = String(item.id || item.title || "");
          if (key && !unique.has(key)) unique.set(key, item);
        }
        const stableItems = [...unique.values()].sort((a, b) =>
          String(a.id || a.title || "").localeCompare(String(b.id || b.title || ""))
        );
        promptsCache = stableItems;
        try {
          localStorage.setItem(PROMPT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: stableItems }));
        } catch (_) {}
        return stableItems;
      })().finally(() => { promptsPromise = null; });
    }
    return promptsPromise;
  }

  // Classify prompts using explicit tags first, then title/description, and finally body.
  // Generic words are deliberately excluded to prevent unrelated prompts being misfiled.
  const categoryRules = {
    image: {
      tags: ['image-generation','image-gen','graphic-design','visual-design','logo-design','illustration','photography','midjourney','stable-diffusion','dall-e','image-editing','prompt-art'],
      title: ['image generation','image generator','visual design','graphic design','logo design','poster design','illustration','photo editing','image editing','character concept art','product photography'],
      description: ['generate an image','create a logo','design a poster','visual artwork','image prompt','photorealistic image','illustration prompt','edit an image'],
      body: ['generate an image of','create an image of','image-generation prompt','visual style','negative prompt','aspect ratio','midjourney','stable diffusion','dall e prompt']
    },
    coding: {
      tags: ['programming','software-development','web-development','javascript','typescript','python','html','css','debugging','code-review','api-development','frontend-development','backend-development','mobile-app-development','unit-testing','git','react','nodejs'],
      title: ['programming','write code','debug code','fix this code','code review','software development','web development','build an app','build a website','javascript function','python script','api endpoint','react component','unit tests','sql query generator'],
      description: ['write or explain code','debugging code','software architecture','develop a web app','build a mobile app','refactor code','find bugs in code','create a function','programming assistant'],
      body: ['write a function in python','write a python script','write javascript code','create an html page','create a css stylesheet','debug the following code','fix the following error','refactor this code','write unit tests','implement this api','return the complete code','code snippet','```javascript','```python','```html','```css']
    },
    writing: {
      tags: ['copywriting','blog-writing','creative-writing','storytelling','content-writing','editing','proofreading','email-writing','scriptwriting','technical-writing','resume-writing','poetry'],
      title: ['copywriting','blog post','article writing','creative writing','story writing','write a story','rewrite this text','proofread','draft an email','video script','write a caption','resume writer','press release'],
      description: ['write an article','create written content','improve this text','edit and proofread','draft a professional email','write a short story','develop a narrative','write a script'],
      body: ['write in a clear and engaging style','write a blog post','draft an email','rewrite the following text','proofread the following','write a short story','create a compelling headline','tone of voice','target word count','write a persuasive paragraph']
    },
    study: {
      tags: ['education','learning','tutoring','study-guide','lesson-plan','exam-preparation','homework','language-learning','flashcards','quiz-generation','teaching'],
      title: ['study guide','lesson plan','practice questions','exam preparation','teach me','learning plan','flashcards','homework help','explain a concept','language tutor','quiz generator'],
      description: ['help me learn','explain this concept','prepare for an exam','create study materials','teach a subject','practice exercises','learning objectives','student-friendly explanation'],
      body: ['explain it step by step','explain like i am a beginner','create a quiz','make flashcards','test my understanding','give me practice questions','provide the answer and explanation','learning objectives','lesson plan for students']
    },
    business: {
      tags: ['business-strategy','marketing-strategy','sales','startup','entrepreneurship','market-research','customer-research','business-plan','ecommerce','pricing-strategy','brand-strategy','product-management'],
      title: ['business plan','marketing strategy','sales strategy','market research','target audience','customer persona','startup idea','business strategy','competitor analysis','product launch','pricing strategy','business model'],
      description: ['grow a business','launch a product','analyze competitors','identify a target market','customer acquisition','revenue model','business growth strategy','market opportunity'],
      body: ['ideal customer profile','value proposition','go to market strategy','market size','competitive landscape','customer acquisition cost','revenue streams','business model canvas','marketing funnel','pricing model']
    },
    social: {
      tags: ['social-media','instagram','tiktok','youtube','hashtags','social-media-marketing','content-calendar','influencer-marketing','linkedin-content','reels'],
      title: ['social media post','instagram post','tiktok video','youtube video','hashtag strategy','social media caption','reel ideas','youtube description','linkedin post','social content calendar'],
      description: ['grow social media engagement','create content for instagram','short-form video ideas','social media campaign','increase followers','platform-specific content','viral reel ideas'],
      body: ['instagram carousel','tiktok hook','youtube title and description','reel script','hashtags for this post','call to action','social media calendar','engagement rate','short form video','caption for instagram']
    },
    productivity: {
      tags: ['productivity','time-management','task-management','goal-setting','personal-planning','workflow','habit-building','project-management','daily-planning','organization'],
      title: ['time management','daily schedule','weekly planner','goal setting','task prioritization','habit tracker','project timeline','organize my tasks','personal productivity','workflow optimization','routine planner'],
      description: ['manage my time','organize daily tasks','build a productive routine','break goals into tasks','prioritize my workload','plan my week','improve personal workflow'],
      body: ['daily schedule','weekly plan','prioritize these tasks','break this goal into steps','time blocking','habit tracker','morning routine','pomodoro technique','project milestones','to do list']
    },
    gaming: {
      tags: ['game-design','video-games','tabletop-rpg','dungeons-and-dragons','game-development','npc','worldbuilding','character-design','quest-design','level-design'],
      title: ['game design','design a game','game mechanics','non-player character','rpg character','quest ideas','video game','game storyline','tabletop roleplaying','fictional world','level design'],
      description: ['design gameplay','create a game character','build a fictional world','develop quests','game balancing','roleplaying campaign','level design ideas'],
      body: ['player character','non player character','quest objectives','game mechanics','worldbuilding','campaign setting','boss fight','level progression','loot system','role playing game']
    },
    data: {
      tags: ['data-analysis','data-visualization','statistics','spreadsheet','excel','business-intelligence','data-cleaning','reporting','data-science','sql-analysis','dashboard','machine-learning'],
      title: ['data analysis','data visualization','statistical analysis','data cleaning','spreadsheet formula','excel formula','data report','interpret statistics','dataset analysis','analytics dashboard','data science'],
      description: ['analyze a dataset','visualize data','interpret statistical results','clean and transform data','summarize a dataset','create a dashboard','analyze trends in data'],
      body: ['analyze the following dataset','identify trends and outliers','calculate summary statistics','create a pivot table','write an excel formula','dataframe','csv file','plot a chart','data visualization','missing values','correlation analysis','descriptive statistics']
    }
  };

  function normalize(value) {
    return String(value || '').toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function containsPhrase(text, phrase) {
    const haystack = ` ${normalize(text)} `;
    const needle = ` ${normalize(phrase)} `;
    return haystack.includes(needle);
  }

  function categoryScore(prompt, categoryKey) {
    const rules = categoryRules[categoryKey];
    const title = normalize(prompt.title);
    const description = normalize(prompt.description);
    const body = normalize(prompt.body || prompt.prompt || prompt.content || '');
    const rawTags = Array.isArray(prompt.tags) ? prompt.tags : String(prompt.tags || '').split(/[ ,]+/);
    const tags = rawTags.map(normalize).filter(Boolean);
    let score = 0;

    for (const tag of tags) {
      if (rules.tags.some(rule => normalize(rule) === tag)) score += 8;
      else if (rules.tags.some(rule => tag.length >= 6 && normalize(rule).length >= 6 && (tag.startsWith(normalize(rule)) || normalize(rule).startsWith(tag)))) score += 3;
    }
    for (const phrase of rules.title) if (containsPhrase(title, phrase)) score += 8;
    for (const phrase of rules.description) if (containsPhrase(description, phrase)) score += 4;
    for (const phrase of rules.body) if (containsPhrase(body, phrase)) score += 2;
    return score;
  }

  function classifyPrompt(prompt) {
    const scores = Object.keys(categoryRules).map(key => ({ key, score: categoryScore(prompt, key) }))
      .sort((a, b) => b.score - a.score);
    const first = scores[0];
    const second = scores[1];
    // Require meaningful evidence and a clear lead over the next category.
    if (!first || first.score < 4) return null;
    if (second && second.score > 0 && first.score - second.score < 3) return null;
    return first.key;
  }

  function promptMatches(prompt, categoryKey) {
    return classifyPrompt(prompt) === categoryKey;
  }

  function addText(parent, tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value || "";
    parent.appendChild(el);
    return el;
  }

  function renderPrompts(categoryKey, area, items) {
    area.replaceChildren();
    const matches = items.filter(item => promptMatches(item, categoryKey)).slice(0, 20);
    if (!matches.length) {
      addText(area, "p", "prompt-status", "فعلاً پرامپتی برای این دسته در نتایج دریافت‌شده پیدا نشد.");
      addText(area, "p", "prompt-note", "دسته‌بندی بر اساس عنوان، توضیحات و تگ‌ها انجام می‌شود؛ ممکن است بعضی پرامپت‌ها تگ مناسب نداشته باشند.");
      return;
    }

    addText(area, "p", "prompt-count", `${matches.length} پرامپت از ${items.length} مورد دریافت‌شده`);
    matches.forEach((prompt, index) => {
      const item = document.createElement("article");
      item.className = "prompt-item";
      const heading = addText(item, "h3", "prompt-title", prompt.title || `Prompt ${index + 1}`);
      heading.dir = "auto";
      if (prompt.description) {
        const description = addText(item, "p", "prompt-description", prompt.description);
        description.dir = "auto";
      }
      const bodyText = prompt.body || prompt.prompt || prompt.content || prompt.description || "";
      const body = addText(item, "pre", "prompt-body", bodyText);
      body.dir = "auto";

      const actions = document.createElement("div");
      actions.className = "prompt-actions";
      const copy = addText(actions, "button", "copy-prompt", "کپی پرامپت");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(bodyText);
          copy.textContent = "کپی شد ✓";
        } catch (_) {
          const area = document.createElement("textarea");
          area.value = bodyText;
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          const ok = document.execCommand("copy");
          area.remove();
          copy.textContent = ok ? "کپی شد ✓" : "کپی نشد";
        }
        setTimeout(() => { copy.textContent = "کپی پرامپت"; }, 1600);
      });
      actions.appendChild(document.createElement("span"));
      const license = prompt.license ? `License: ${prompt.license}` : "";
      if (license) addText(actions, "small", "prompt-license", license);
      item.appendChild(actions);

      const sourceName = prompt.source_name || prompt.author_name || "";
      if (sourceName) addText(item, "p", "prompt-source", `منبع: ${sourceName}`);
      area.appendChild(item);
    });
  }

  async function loadCategory(categoryKey) {
    const area = ensurePromptArea();
    area.replaceChildren();
    addText(area, "p", "prompt-status", "در حال دریافت پرامپت‌ها…");
    try {
      const items = await getPrompts();
      renderPrompts(categoryKey, area, items);
    } catch (error) {
      area.replaceChildren();
      addText(area, "p", "prompt-error", "دریافت پرامپت‌ها ناموفق بود.");
      addText(area, "p", "prompt-note", "ممکن است API اجازهٔ دسترسی از مرورگر را ندهد (CORS) یا اتصال اینترنت مشکل داشته باشد. اگر این پیام ماند، اتصال را با روش دیگری انجام می‌دهیم.");
      console.error("OPL prompt API error:", error);
    }
  }

  startButton.addEventListener("click", () => showView("categories"));
  backButton.addEventListener("click", () => showView("home"));
  categoriesBackButton.addEventListener("click", () => showView("categories"));
  aboutBackButton.addEventListener("click", () => showView("home"));
  brandHome.addEventListener("click", event => {
    event.preventDefault();
    showView("about");
  });

  categoryCards.forEach(card => {
    card.addEventListener("click", () => {
      const key = card.dataset.category;
      const category = categories[key];
      if (!category) return;
      activeCategory = key;
      document.getElementById("detailIcon").textContent = category.icon;
      document.getElementById("detailKicker").textContent = `CATEGORY / ${category.number}`;
      document.getElementById("detailTitle").textContent = category.title;
      document.getElementById("detailDescription").textContent = category.description;
      const empty = detailView.querySelector(".empty-state");
      if (empty) empty.classList.add("hidden");
      showView("detail");
      loadCategory(activeCategory);
    });
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();