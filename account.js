(function () {
  "use strict";

  var API = "/api/auth";
  var API_ROOT = "/api";
  var PREVIEW_KEY = "np_preview_user";
  var params = new URLSearchParams(location.search);
  var preview = params.get("preview") === "1";

  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(node, message, state) {
    if (!node) return;
    node.textContent = message || "";
    if (state) node.setAttribute("data-state", state);
    else node.removeAttribute("data-state");
  }

  function request(path, options, base) {
    var opts = options || {};
    return fetch((base || API) + path, {
      method: opts.method || "GET",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
    });
  }

  function errorText(result) {
    if (result.data && result.data.error) return result.data.error;
    if (result.status === 404) return "サーバーに接続できません（API未接続）。";
    return "処理に失敗しました。時間をおいて再度お試しください。";
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function previewUser() {
    try {
      return JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function setPreviewUser(user) {
    try {
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  function clearPreviewUser() {
    try {
      sessionStorage.removeItem(PREVIEW_KEY);
    } catch (e) {}
  }

  /* ---- customer page (login / signup) ---- */

  function initTabs() {
    var tabLogin = el("tab-login");
    var tabSignup = el("tab-signup");
    var panelLogin = el("panel-login");
    var panelSignup = el("panel-signup");
    if (!tabLogin || !tabSignup) return;

    function select(which) {
      var isLogin = which === "login";
      tabLogin.setAttribute("aria-selected", String(isLogin));
      tabSignup.setAttribute("aria-selected", String(!isLogin));
      panelLogin.hidden = !isLogin;
      panelSignup.hidden = isLogin;
    }

    tabLogin.addEventListener("click", function () {
      select("login");
    });
    tabSignup.addEventListener("click", function () {
      select("signup");
    });
  }

  function initPasswordToggles() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-toggle]"),
      function (btn) {
        btn.addEventListener("click", function () {
          var input = el(btn.getAttribute("data-toggle"));
          if (!input) return;
          var show = input.type === "password";
          input.type = show ? "text" : "password";
          btn.textContent = show ? "隠す" : "表示";
          btn.setAttribute("aria-label", show ? "パスワードを隠す" : "パスワードを表示");
        });
      },
    );
  }

  function initLoginForm() {
    var form = el("login-form");
    if (!form) return;
    var status = el("login-status");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = el("login-email").value.trim();
      var password = el("login-password").value;

      if (!validEmail(email)) {
        setStatus(status, "メールアドレスの形式を確認してください。", "error");
        return;
      }
      if (!password) {
        setStatus(status, "パスワードを入力してください。", "error");
        return;
      }

      if (preview) {
        setPreviewUser({ email: email, name: email.split("@")[0], created_at: Date.now() });
        setStatus(status, "プレビューとしてログインしました。", "ok");
        location.href = "dashboard.html?preview=1";
        return;
      }

      setStatus(status, "ログインしています…", "info");
      request("/login", { method: "POST", body: { email: email, password: password } })
        .then(function (result) {
          if (!result.ok) {
            setStatus(status, errorText(result), "error");
            return;
          }
          location.href = "dashboard.html";
        })
        .catch(function () {
          setStatus(status, "サーバーに接続できませんでした。", "error");
        });
    });
  }

  function initSignupForm() {
    var form = el("signup-form");
    if (!form) return;
    var status = el("signup-status");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = el("signup-name").value.trim();
      var email = el("signup-email").value.trim();
      var password = el("signup-password").value;
      var password2 = el("signup-password2").value;

      if (!validEmail(email)) {
        setStatus(status, "メールアドレスの形式を確認してください。", "error");
        return;
      }
      if (password.length < 8) {
        setStatus(status, "パスワードは8文字以上にしてください。", "error");
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        setStatus(status, "パスワードは英字と数字を含めてください。", "error");
        return;
      }
      if (password !== password2) {
        setStatus(status, "パスワードが一致しません。", "error");
        return;
      }

      if (preview) {
        setPreviewUser({ email: email, name: name || email.split("@")[0], created_at: Date.now() });
        setStatus(status, "プレビューとして登録しました。", "ok");
        location.href = "dashboard.html?preview=1";
        return;
      }

      setStatus(status, "登録しています…", "info");
      request("/register", { method: "POST", body: { name: name, email: email, password: password } })
        .then(function (result) {
          if (!result.ok) {
            setStatus(status, errorText(result), "error");
            return;
          }
          location.href = "dashboard.html";
        })
        .catch(function () {
          setStatus(status, "サーバーに接続できませんでした。", "error");
        });
    });
  }

  /* ---- dashboard ---- */

  function formatDate(ms) {
    if (!ms) return "-";
    try {
      return new Date(ms).toLocaleDateString("ja-JP");
    } catch (e) {
      return "-";
    }
  }

  function renderDashboard(user) {
    if (el("dash-name")) el("dash-name").textContent = user.name || user.email || "お客様";
    if (el("dash-email")) el("dash-email").textContent = user.email || "-";
    if (el("dash-created")) el("dash-created").textContent = formatDate(user.created_at);
    var used = typeof user.used_today === "number" ? user.used_today : 0;
    var limit = typeof user.daily_limit === "number" ? user.daily_limit : 100;
    if (el("usage-text")) el("usage-text").textContent = used + " / " + limit + " 行（本日）";
    if (el("usage-bar")) el("usage-bar").style.width = Math.min(100, (used / limit) * 100) + "%";
  }

  function initDashboard() {
    var logout = el("logout-btn");
    if (logout) {
      logout.addEventListener("click", function () {
        clearPreviewUser();
        if (preview) {
          location.href = "customer.html";
          return;
        }
        request("/logout", { method: "POST" }).then(function () {
          location.href = "customer.html";
        });
      });
    }

    if (preview) {
      var fallback = previewUser() || { email: "preview@example.com", name: "プレビュー", created_at: Date.now() };
      renderDashboard(fallback);
      return;
    }

    request("/me")
      .then(function (result) {
        if (result.status === 401) {
          location.href = "customer.html";
          return;
        }
        if (!result.ok || !result.data.user) {
          setStatus(el("dash-error"), "サーバーに接続できませんでした。通信状況を確認して再読み込みしてください。", "error");
          return;
        }
        renderDashboard(result.data.user);
      })
      .catch(function () {
        setStatus(el("dash-error"), "サーバーに接続できませんでした。通信状況を確認して再読み込みしてください。", "error");
      });
  }

  function formatCounts(counts) {
    var labels = { positive: "好意的", negative: "否定的", mixed: "賛否混在", hold: "判定保留", skipped: "未分類" };
    return Object.keys(labels)
      .filter(function (key) {
        return counts && counts[key];
      })
      .map(function (key) {
        return labels[key] + " " + counts[key] + "件";
      })
      .join("　");
  }

  function renderJobs(jobs) {
    var list = el("history-list");
    if (!list) return;
    list.replaceChildren();
    jobs.forEach(function (job) {
      var card = document.createElement("article");
      card.className = "dash-card";
      var title = document.createElement("h2");
      title.textContent = job.title || "分類結果";
      var meta = document.createElement("p");
      meta.className = "service-note";
      meta.textContent =
        formatDate(job.created_at) + " · " + job.total + "件" + (formatCounts(job.counts) ? " · " + formatCounts(job.counts) : "");
      var actions = document.createElement("div");
      actions.className = "dash-actions";
      var download = document.createElement("a");
      download.href = API_ROOT + "/jobs/" + encodeURIComponent(job.id) + "/csv";
      download.textContent = "CSVを保存 ↓";
      actions.append(download);
      card.append(title, meta, actions);
      list.append(card);
    });
    list.hidden = false;
    var empty = el("history-empty");
    if (empty) empty.hidden = true;
  }

  function initHistory() {
    if (preview) {
      if (el("preview-banner")) el("preview-banner").hidden = false;
      return;
    }
    function offline() {
      var box = el("history-empty");
      if (box) {
        box.textContent =
          "サーバーに接続できませんでした。通信状況を確認して再読み込みしてください。";
      }
    }
    request("/me")
      .then(function (result) {
        if (result.status === 401) {
          location.href = "customer.html";
          return;
        }
        if (!result.ok) {
          offline();
          return;
        }
        request("/jobs", {}, API_ROOT)
          .then(function (res) {
            if (res.status === 401) {
              location.href = "customer.html";
              return;
            }
            if (!res.ok) {
              offline();
              return;
            }
            var jobs = (res.data && res.data.jobs) || [];
            if (jobs.length) renderJobs(jobs);
          })
          .catch(offline);
      })
      .catch(offline);
  }

  function initClassify() {
    var box = el("save-result");
    var button = el("save-run");
    var status = el("save-status");
    if (!box || !button) return;
    // This is the account feature: require a real session. The public demo is try.html.
    if (!preview) {
      request("/me")
        .then(function (res) {
          if (res.status === 401) location.href = "customer.html";
        })
        .catch(function () {});
    }
    var payload = null;
    var saveToken = null;
    var saving = false;
    function newToken() {
      try {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      } catch (e) {}
      return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    }
    window.addEventListener("nagiport:complete", function (event) {
      payload = event.detail && event.detail.results ? event.detail.results : null;
      saveToken = payload && payload.length ? newToken() : null;
      if (payload && payload.length) {
        box.hidden = false;
        setStatus(status, "", "");
      }
    });
    // Clear any previous save state when a new run starts, fails or is cancelled.
    function resetSave() {
      payload = null;
      saveToken = null;
      box.hidden = true;
      setStatus(status, "", "");
    }
    ["nagiport:start", "nagiport:cancel", "nagiport:fail"].forEach(function (name) {
      window.addEventListener(name, resetSave);
    });
    button.addEventListener("click", function () {
      if (saving) return;
      if (!payload || !payload.length) {
        setStatus(status, "保存する結果がありません。", "error");
        return;
      }
      if (preview) {
        setStatus(status, "プレビューでは保存できません。", "info");
        return;
      }
      saving = true;
      button.disabled = true;
      setStatus(status, "保存しています…", "info");
      request(
        "/jobs",
        { method: "POST", body: { results: payload, client_token: saveToken } },
        API_ROOT,
      )
        .then(function (res) {
          if (res.status === 401) {
            location.href = "customer.html";
            return;
          }
          if (!res.ok) {
            setStatus(status, errorText(res), "error");
            return;
          }
          // Keep saveToken so pressing again for the same result is idempotent.
          setStatus(status, res.data && res.data.duplicate ? "保存済みです。" : "保存しました。", "ok");
          var link = document.createElement("a");
          link.href = "history.html";
          link.textContent = "履歴を見る ↗";
          status.append(" ");
          status.append(link);
        })
        .catch(function () {
          setStatus(status, "サーバーに接続できませんでした。", "error");
        })
        .then(function () {
          saving = false;
          button.disabled = false;
        });
    });
  }

  /* ---- boot ---- */

  if (preview && el("preview-banner")) el("preview-banner").hidden = false;

  var page = document.body.getAttribute("data-page");
  if (page === "dashboard") {
    initDashboard();
  } else if (page === "history") {
    initHistory();
  } else if (page === "classify") {
    initClassify();
  } else {
    initTabs();
    initPasswordToggles();
    initLoginForm();
    initSignupForm();
  }
})();
