import { describe, expect, it } from "vitest";
import { authMethodsFromStatus } from "../src/main/newapi-utils";
import { newApiExternalAuthSchema } from "../src/shared/contracts";

describe("HXSEC auth methods", () => {
  it("maps the public platform status to available login methods", () => {
    const methods = authMethodsFromStatus({
      password_login_enabled: true,
      password_register_enabled: false,
      register_enabled: true,
      email_verification: true,
      passkey_login: true,
      github_oauth: true,
      discord_oauth: false,
      oidc_enabled: false,
      custom_oauth_providers: [
        {
          slug: "gitee",
          name: "Gitee「码云」",
          icon: "Gitee",
          authorization_endpoint: "https://gitee.com/oauth/authorize",
          client_id: "public-client",
        },
        {
          slug: "modelscope",
          name: "Modelscope「魔搭社区」",
          icon: "modelscope",
        },
      ],
    });

    expect(methods).toMatchObject({
      passwordLogin: true,
      passwordRegister: false,
      register: true,
      emailVerification: true,
      passkeyLogin: true,
    });
    expect(methods.providers.map((provider) => provider.key)).toEqual([
      "github",
      "gitee",
      "modelscope",
    ]);
  });

  it("shows newly configured providers without a client change", () => {
    const methods = authMethodsFromStatus({
      github_oauth: false,
      google_oauth: true,
      custom_oauth_providers: [
        { slug: "new-idp", name: "Campus SSO", icon: "sso" },
      ],
    });

    expect(methods.providers).toEqual([
      {
        key: "new-idp",
        name: "Campus SSO",
        icon: "sso",
        kind: "oauth",
      },
      {
        key: "google",
        name: "Google",
        icon: "google",
        kind: "oauth",
      },
    ]);
  });

  it("omits incomplete and duplicate custom providers", () => {
    const methods = authMethodsFromStatus({
      github_oauth: true,
      custom_oauth_providers: [
        { slug: "github", name: "Duplicate GitHub" },
        { slug: "broken", name: "" },
        { name: "No slug" },
      ],
    });

    expect(methods.providers.map((provider) => provider.key)).toEqual(["github"]);
  });

  it("uses OIDC display name and disables password login when requested", () => {
    const methods = authMethodsFromStatus({
      password_login_enabled: false,
      oidc_enabled: true,
      oidc_display_name: "阿里云统一身份认证",
    });

    expect(methods.passwordLogin).toBe(false);
    expect(methods.providers).toEqual([
      {
        key: "oidc",
        name: "阿里云统一身份认证",
        icon: "oidc",
        kind: "oidc",
      },
    ]);
  });

  it("keeps a safe password-login fallback for malformed status", () => {
    expect(authMethodsFromStatus(null)).toMatchObject({
      passwordLogin: true,
      passwordRegister: false,
      register: false,
      passkeyLogin: false,
      providers: [],
    });
  });

  it("requires a provider for third-party auth requests", () => {
    expect(newApiExternalAuthSchema.safeParse({ kind: "oauth" }).success).toBe(false);
    expect(
      newApiExternalAuthSchema.safeParse({ kind: "oauth", provider: "github" }).success,
    ).toBe(true);
    expect(newApiExternalAuthSchema.safeParse({ kind: "passkey" }).success).toBe(true);
  });
});