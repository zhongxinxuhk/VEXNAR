const api = "/vexnar-api/platform";
function isFields(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function textOf(value) {
  return value ? String(value) : "";
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function listOf(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).join(" \xB7 ") : "";
}
const entry = document.getElementById("vexnar-sign-in");
const read = async (path, method = "GET", data) => {
  let response;
  let raw;
  const signal = method === "GET" ? AbortSignal.timeout(15e3) : void 0;
  try {
    const init = { method, headers: { "Content-Type": "application/json" } };
    if (signal) init.signal = signal;
    if (data !== void 0) init.body = JSON.stringify(data);
    response = await fetch(api + path, init);
    raw = await response.text();
  } catch {
    if (signal?.aborted) throw new Error("\u7B49\u5F85 VEXNAR \u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5");
    throw new Error("\u65E0\u6CD5\u8FDE\u63A5 VEXNAR \u670D\u52A1\uFF0C\u8BF7\u786E\u8BA4\u5BA2\u6237\u7AEF\u4ECD\u5728\u8FD0\u884C");
  }
  let body;
  try {
    body = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    body = void 0;
  }
  if (!response.ok) {
    const failure = textOf(isFields(body) ? body.error : void 0);
    throw new Error(failure !== "" ? failure : response.status === 404 ? "VEXNAR \u670D\u52A1\u7F3A\u5C11\u8D26\u53F7\u63A5\u53E3\uFF08HTTP 404\uFF09\uFF0C\u8BF7\u91CD\u542F\u5BA2\u6237\u7AEF" : `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
  }
  if (body === void 0) throw new Error("VEXNAR \u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\uFF0C\u8BF7\u91CD\u542F\u5BA2\u6237\u7AEF");
  return isFields(body) ? body : {};
};
if (entry) {
  const node = (id) => document.getElementById(id);
  const notice = node("notice");
  const message = (text, state = "ready") => {
    if (notice === null) return;
    notice.textContent = text;
    notice.dataset.state = state;
    notice.dataset.error = String(state === "error");
  };
  try {
    const form = document.getElementById("token-login");
    if (!(form instanceof HTMLFormElement)) throw new Error("\u767B\u5F55\u8868\u5355 #token-login");
    const control = form.elements.namedItem("access_token");
    if (!(control instanceof HTMLInputElement)) throw new Error("\u8BBF\u95EE\u4EE4\u724C\u8F93\u5165\u6846");
    const tokenForm = form;
    const token = control;
    const reveal = node("reveal");
    const retry = node("retry");
    const methods = node("methods");
    let running = false;
    if (new URLSearchParams(location.search).get("signed-out") === "1") {
      message("\u5DF2\u9000\u51FA\u767B\u5F55\uFF1A\u8BBF\u95EE\u4EE4\u724C\u4E0E\u4FDD\u5B58\u7684 APIKEY \u5DF2\u5220\u9664\u3002", "ready");
    }
    const present = (account) => {
      if (account.signed_in && !account.reauth_required) {
        location.replace("/");
        return true;
      }
      return false;
    };
    const showError = (error) => message(errorText(error), "error");
    async function initialize() {
      try {
        if (retry !== null) retry.hidden = true;
        if (new URLSearchParams(location.search).get("signed-out") === "1") return;
        message("\u6B63\u5728\u68C0\u67E5\u8D26\u6237\u72B6\u6001\u2026", "busy");
        const account = await read("/account");
        if (present(account)) return;
        message(account.reauth_required ? "\u8D26\u6237\u51ED\u636E\u5DF2\u5931\u6548\uFF0C\u8BF7\u7528\u8BBF\u95EE\u4EE4\u724C\u91CD\u65B0\u9A8C\u8BC1\u3002" : "\u5DF2\u8FDE\u63A5 VEXNAR\uFF0C\u8BF7\u7C98\u8D34\u8BBF\u95EE\u4EE4\u724C\u7EE7\u7EED\u3002");
        void read("/methods").then((result) => {
          if (methods === null) return;
          const text = listOf(result.methods);
          methods.textContent = text === "" ? "" : `\u5E73\u53F0\u767B\u5F55\u65B9\u5F0F\uFF1A${text}`;
        }).catch(() => {
        });
      } catch (error) {
        if (retry !== null) retry.hidden = false;
        showError(error);
      }
    }
    const work = async (action) => {
      if (running) return;
      running = true;
      for (const button of entry.querySelectorAll("button")) button.disabled = true;
      try {
        await action();
      } catch (error) {
        showError(error);
      } finally {
        running = false;
        for (const button of entry.querySelectorAll("button")) button.disabled = false;
      }
    };
    tokenForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void work(async () => {
        if (token.value.trim() === "") {
          message("\u8BF7\u5148\u7C98\u8D34\u8BBF\u95EE\u4EE4\u724C\u3002", "error");
          token.focus();
          return;
        }
        message("\u6B63\u5728\u9A8C\u8BC1\u8BBF\u95EE\u4EE4\u724C\u5E76\u540C\u6B65\u6A21\u578B\u2026", "busy");
        const secret = token.value.trim();
        token.value = "";
        if (!present(await read("/login/token", "POST", { access_token: secret }))) await initialize();
      });
    });
    if (reveal !== null) {
      reveal.addEventListener("click", () => {
        const shown = token.type === "text";
        token.type = shown ? "password" : "text";
        reveal.textContent = shown ? "\u663E\u793A" : "\u9690\u85CF";
        reveal.setAttribute("aria-pressed", String(!shown));
        reveal.setAttribute("aria-label", shown ? "\u663E\u793A\u8BBF\u95EE\u4EE4\u724C" : "\u9690\u85CF\u8BBF\u95EE\u4EE4\u724C");
        token.focus();
      });
    }
    if (retry !== null) retry.addEventListener("click", () => void work(initialize));
    void initialize();
  } catch (error) {
    message(`\u767B\u5F55\u9875\u52A0\u8F7D\u5931\u8D25\uFF08${errorText(error)}\uFF09\uFF0C\u8BF7\u91CD\u542F VEXNAR \u540E\u91CD\u8BD5\u3002`, "error");
  }
} else {
  let checking = false;
  async function checkSession() {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const session = await read("/ready");
      if (!session.ready) location.replace("/");
    } catch {
    } finally {
      checking = false;
    }
  }
  setInterval(checkSession, 1e4);
  document.addEventListener("visibilitychange", checkSession);
}
