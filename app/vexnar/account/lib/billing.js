import { exchange, gateOpen, PlatformError, platformOrigin } from "./platform-account.js";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === "string" ? value.trim() : "";
const positiveInt = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function money(value) {
  const raw = typeof value === "number" ? String(value) : text(value);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return "";
  return Number(raw).toFixed(2);
}
function methods(config) {
  const minimum = (value) => positiveInt(Number(value)) ? Number(value) : 1;
  const gateways = {
    stripe: { provider: "stripe", enabled: config.enable_stripe_topup === true },
    waffo: { provider: "waffo", enabled: config.enable_waffo_topup === true },
    "waffo-pancake": { provider: "waffo-pancake", enabled: config.enable_waffo_pancake_topup === true },
    waffo_pancake: { provider: "waffo-pancake", enabled: config.enable_waffo_pancake_topup === true }
  };
  const result = [];
  for (const value of array(config.pay_methods)) {
    const row = record(value);
    const id = text(row.type);
    const name = text(row.name);
    if (!id || !name || id === "creem" || result.some((method) => method.id === id)) continue;
    const gateway = Object.hasOwn(gateways, id) ? gateways[id] : void 0;
    if (gateway ? !gateway.enabled : config.enable_online_topup !== true) continue;
    const provider = gateway?.provider ?? "epay";
    const floor = provider === "epay" ? Math.max(minimum(row.min_topup), minimum(config.min_topup)) : minimum(row.min_topup);
    if (provider === "waffo") {
      const channels = array(config.waffo_pay_methods);
      if (channels.length > 0) {
        channels.forEach((channel, index) => {
          const label = text(record(channel).paymentMethodName) || text(record(channel).name);
          if (label) result.push({ id: `waffo:${index}`, name: label, minimum: floor, provider, subscriptions: false, index });
        });
        if (result.some((method) => method.provider === "waffo")) continue;
      }
    }
    result.push({ id, name, minimum: floor, provider, subscriptions: provider === "epay" });
  }
  if (config.enable_creem_topup === true) {
    let values = config.creem_products;
    if (typeof values === "string") {
      try {
        values = JSON.parse(values);
      } catch {
        values = [];
      }
    }
    const products = array(values).flatMap((item) => {
      const row = record(item);
      const id = text(row.productId);
      const name = text(row.name);
      const price = money(row.price);
      const currency = text(row.currency).toUpperCase();
      return id && name && price && /^[A-Z]{3}$/.test(currency) ? [{ id, name, price, currency }] : [];
    });
    if (products.length) result.push({ id: "creem", name: "Creem", minimum: 1, provider: "creem", subscriptions: false, products });
  }
  return result;
}
function selectionFrom(input) {
  const method = text(input.method);
  if (!method || method.length > 80) throw new PlatformError(400, "\u8BF7\u9009\u62E9\u652F\u4ED8\u6E20\u9053");
  if (input.kind === "subscription" && positiveInt(input.plan)) return { kind: "subscription", method, plan: input.plan };
  if (input.kind === "topup" && positiveInt(input.amount)) {
    const product = text(input.product);
    return { kind: "topup", method, amount: input.amount, ...product ? { product } : {} };
  }
  throw new PlatformError(400, "\u8BF7\u9009\u62E9\u6709\u6548\u7684\u5145\u503C\u91D1\u989D\u6216\u8BA2\u9605\u5957\u9910");
}
function safeCheckoutURL(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
  }
  throw new PlatformError(502, "\u652F\u4ED8\u6E20\u9053\u672A\u8FD4\u56DE\u6709\u6548\u7684\u6536\u94F6\u53F0\u5730\u5740");
}
function epayCheckout(url, fields) {
  const target = new URL(url);
  if (!/(^|\.)(zpayz\.cn|z-pay\.cn)$/.test(target.hostname) || !target.pathname.endsWith("/submit.php")) {
    return { url, fields };
  }
  for (const [name, value] of Object.entries(fields)) target.searchParams.set(name, value);
  return { url, scanURL: target.href };
}
function createBilling(readAccount) {
  const orders = /* @__PURE__ */ new Map();
  const account = async () => {
    const state = await readAccount();
    if (!gateOpen(state)) throw new PlatformError(401, "\u8BF7\u5148\u767B\u5F55\u5E0C\u7075 AI");
    if (!state.access_token) throw new PlatformError(403, "\u5F53\u524D\u8D26\u6237\u7F3A\u5C11\u53EF\u7528\u7684\u8BBF\u95EE\u4EE4\u724C");
    return state;
  };
  async function upstream(state, path, body, ordering = false) {
    const result = await exchange(body ? "POST" : "GET", platformOrigin() + path, {
      headers: { Authorization: `Bearer ${state.access_token}`, "New-Api-User": String(state.user_id) },
      body,
      unavailable: ordering ? "\u672A\u80FD\u786E\u8BA4\u8BA2\u5355\u662F\u5426\u521B\u5EFA\uFF0C\u8BF7\u5148\u6838\u5BF9\u5E73\u53F0\u8D26\u5355\u518D\u91CD\u8BD5" : "\u65E0\u6CD5\u8FDE\u63A5\u5E0C\u7075 AI \u652F\u4ED8\u63A5\u53E3"
    });
    const payload = record(result.data);
    if (result.status === 401 || result.status === 403) {
      throw new PlatformError(403, "\u5E0C\u7075 AI \u672A\u6388\u6743\u6B64\u64CD\u4F5C\uFF0C\u8BF7\u68C0\u67E5\u8BBF\u95EE\u4EE4\u724C\u7684\u8D26\u5355\u6743\u9650");
    }
    if (!result.ok || payload.success !== true && payload.message !== "success") {
      throw new PlatformError(result.status >= 500 ? 502 : 422, "\u5E0C\u7075 AI \u672A\u80FD\u5B8C\u6210\u8BF7\u6C42\uFF0C\u8BF7\u68C0\u67E5\u652F\u4ED8\u914D\u7F6E\u548C\u8D26\u6237\u6743\u9650");
    }
    return payload;
  }
  const configuration = async (state) => record((await upstream(state, "/api/user/topup/info")).data);
  const plans = async (state) => {
    const result = await upstream(state, "/api/subscription/plans");
    return array(result.data).flatMap((item) => {
      const row = record(record(item).plan);
      const title = text(row.title);
      const price2 = money(row.price_amount);
      const quota = row.total_amount === 0 || positiveInt(row.total_amount) ? row.total_amount : null;
      return row.enabled === true && positiveInt(row.id) && title && price2 ? [{ id: row.id, title, price: Number(price2), currency: "CNY", quota }] : [];
    });
  };
  async function options() {
    const state = await account();
    const config = await configuration(state);
    const available = methods(config);
    const [subscriptions, status2] = available.some((method) => method.subscriptions) ? await Promise.all([plans(state).catch(() => []), upstream(state, "/api/status").catch(() => void 0)]) : [[], void 0];
    const settings = record(status2?.data);
    const perUnit = settings.quota_per_unit;
    const rate = settings.usd_exchange_rate;
    const quotaScale = positiveInt(perUnit) && typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate / perUnit : null;
    const amounts = [...new Set(array(config.amount_options).filter(positiveInt))];
    const discounts = record(config.discount);
    return {
      amounts,
      discounts: Object.fromEntries(amounts.flatMap((amount) => {
        const ratio = discounts[amount];
        return typeof ratio === "number" && ratio > 0 && ratio < 1 ? [[amount, ratio]] : [];
      })),
      methods: available.map(({ id, name, minimum, subscriptions: subscriptions2, products }) => ({
        id,
        name,
        minimum,
        subscriptions: subscriptions2,
        ...products ? { products: products.map(({ id: id2, name: name2 }) => ({ id: id2, name: name2 })) } : {}
      })),
      plans: subscriptions,
      quotaScale
    };
  }
  async function price(state, input) {
    const selected = methods(await configuration(state)).find((method) => method.id === input.method);
    if (!selected) throw new PlatformError(422, "\u6B64\u652F\u4ED8\u6E20\u9053\u5DF2\u505C\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
    const { provider, index } = selected;
    if (input.kind === "subscription") {
      const plan = (await plans(state)).find((candidate) => candidate.id === input.plan);
      if (!selected.subscriptions || !plan) throw new PlatformError(422, "\u6B64\u5957\u9910\u6216\u652F\u4ED8\u6E20\u9053\u5F53\u524D\u4E0D\u53EF\u7528");
      return {
        provider,
        path: "/api/subscription/epay/pay",
        payment: { plan_id: plan.id, payment_method: selected.id },
        quote: { total: money(plan.price), currency: plan.currency }
      };
    }
    if (provider === "creem") {
      const product = selected.products?.find((item) => item.id === input.product);
      if (!product) throw new PlatformError(422, "\u8BF7\u9009\u62E9\u5F53\u524D\u53EF\u7528\u7684\u5145\u503C\u5546\u54C1");
      return {
        provider,
        path: "/api/user/creem/pay",
        payment: { product_id: product.id, payment_method: "creem" },
        quote: { total: product.price, currency: product.currency }
      };
    }
    if (input.amount < selected.minimum) throw new PlatformError(422, `\u6B64\u6E20\u9053\u6700\u4F4E\u5145\u503C\u91D1\u989D\u4E3A ${selected.minimum}`);
    const prefix = provider === "epay" ? "/api/user" : `/api/user/${provider}`;
    const payment = {
      amount: input.amount,
      ...provider === "epay" || provider === "stripe" ? { payment_method: selected.id } : {},
      ...index === void 0 ? {} : { pay_method_index: index }
    };
    const result = await upstream(state, prefix + "/amount", payment);
    const total = money(result.data);
    if (!total) throw new PlatformError(502, "\u5E73\u53F0\u8FD4\u56DE\u7684\u5B9E\u4ED8\u91D1\u989D\u65E0\u6548");
    return { provider, path: prefix + "/pay", payment, quote: { total, currency: provider === "epay" ? "CNY" : "" } };
  }
  async function order(input) {
    const state = await account();
    const selection = selectionFrom(input);
    const requestID = text(input.request_id);
    const accepted = money(input.total);
    const acceptedCurrency = text(input.currency);
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(requestID) || !accepted) {
      throw new PlatformError(400, "\u8BF7\u5148\u786E\u8BA4\u5B9E\u4ED8\u91D1\u989D");
    }
    const key = `${state.user_id}/${requestID}`;
    const fingerprint = JSON.stringify([selection, accepted, acceptedCurrency]);
    const now = Date.now();
    for (const [id, entry] of orders) if (entry.expires <= now) orders.delete(id);
    const existing = orders.get(key);
    if (existing) {
      if (existing.selection !== fingerprint) throw new PlatformError(409, "\u8BA2\u5355\u9009\u9879\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4");
      return existing.result;
    }
    const result = (async () => {
      const current = await price(state, selection);
      if (current.quote.total !== accepted || current.quote.currency !== acceptedCurrency) {
        throw new PlatformError(409, "\u5B9E\u4ED8\u91D1\u989D\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6\u62A5\u4EF7\u5E76\u786E\u8BA4");
      }
      const upstreamOrder = await upstream(state, current.path, current.payment, true);
      const data = record(upstreamOrder.data);
      if (current.provider === "epay") {
        const fields = Object.fromEntries(Object.entries(data).filter((entry3) => typeof entry3[1] === "string"));
        const trade2 = fields.out_trade_no ?? "";
        if (!fields.sign || !trade2 || money(fields.money) !== accepted) {
          throw new PlatformError(502, "\u6536\u94F6\u53F0\u8FD4\u56DE\u7684\u8BA2\u5355\u4FE1\u606F\u4E0E\u62A5\u4EF7\u4E0D\u4E00\u81F4");
        }
        const entry2 = orders.get(key);
        if (entry2) entry2.trade = trade2;
        return { checkout: epayCheckout(safeCheckoutURL(upstreamOrder.url), fields), canCheckStatus: true };
      }
      const trade = text(data.order_id);
      const entry = orders.get(key);
      if (trade && entry && selection.kind === "topup") entry.trade = trade;
      return {
        checkout: { url: safeCheckoutURL(data.pay_link ?? data.checkout_url ?? data.payment_url) },
        canCheckStatus: !!trade && selection.kind === "topup"
      };
    })();
    orders.set(key, { selection: fingerprint, expires: now + 30 * 6e4, result });
    return result;
  }
  async function status(requestID) {
    const state = await account();
    const entry = orders.get(`${state.user_id}/${requestID}`);
    const trade = entry?.trade;
    if (!trade || entry.expires <= Date.now()) throw new PlatformError(404, "\u627E\u4E0D\u5230\u6B64\u652F\u4ED8\u8BA2\u5355");
    const result = await upstream(state, "/api/user/topup/self?p=0&page_size=10&keyword=" + encodeURIComponent(trade));
    const row = array(record(result.data).items).map(record).find((item) => item.trade_no === trade);
    return { status: row?.status === "success" ? "paid" : row?.status === "expired" || row?.status === "failed" ? "closed" : "pending" };
  }
  return { options, order, status, quote: async (input) => (await price(await account(), selectionFrom(input))).quote };
}
export {
  createBilling
};
