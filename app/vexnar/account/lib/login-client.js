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
  return Array.isArray(value) ? value.join(" \xB7 ") : "";
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
  const node = (id) => {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`\u767B\u5F55\u9875\u7F3A\u5C11 #${id}`);
    return found;
  };
  const form = (id) => {
    const found = document.getElementById(id);
    if (!(found instanceof HTMLFormElement)) throw new Error(`\u767B\u5F55\u9875\u7F3A\u5C11\u8868\u5355 #${id}`);
    return found;
  };
  const input = (owner, name) => {
    const control = owner.elements.namedItem(name);
    if (!(control instanceof HTMLInputElement)) throw new Error(`\u767B\u5F55\u8868\u5355\u7F3A\u5C11 ${name} \u5B57\u6BB5`);
    return control;
  };
  const tokenForm = form("token-login");
  const retry = node("retry");
  const notice = node("notice");
  let running = false;
  const message = (text, error = false) => {
    notice.textContent = text;
    notice.dataset.error = String(error);
  };
  const present = (account) => {
    if (account.signed_in && !account.reauth_required) {
      location.replace("/");
      return true;
    }
    return false;
  };
  const showError = (error) => message(errorText(error), true);
  async function initialize() {
    try {
      retry.hidden = true;
      const account = await read("/account");
      if (present(account)) return;
      message(account.reauth_required ? "\u8BF7\u4F7F\u7528\u8BBF\u95EE\u4EE4\u724C\u91CD\u65B0\u9A8C\u8BC1\u5E0C\u7075 AI \u8D26\u6237\u3002" : "");
      void read("/methods").then((methods) => {
        node("methods").textContent = listOf(methods.methods);
      }).catch(() => {
      });
    } catch (error) {
      retry.hidden = false;
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
      message("\u6B63\u5728\u9A8C\u8BC1\u8BBF\u95EE\u4EE4\u724C\u5E76\u540C\u6B65\u6A21\u578B\u2026");
      const control = input(tokenForm, "access_token");
      const token = control.value;
      control.value = "";
      if (!present(await read("/login/token", "POST", { access_token: token }))) await initialize();
    });
  });
  retry.addEventListener("click", () => void work(initialize));
  void initialize();
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
