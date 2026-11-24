import products from "./missing-products.json" with { type: "json" };
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const allowProduction = args.has("--allow-production");
const checkAccess = args.has("--check-access");
if (apply && checkAccess) throw new Error("Use --check-access ou --apply, separadamente.");
const reportArgument = [...args].find((arg) => arg.startsWith("--report="));
const reportPath = reportArgument ? resolve(reportArgument.slice("--report=".length)) : null;
const origin = String(process.env.BURGER_API_ORIGIN ?? "http://localhost:5041").replace(/\/+$/, "");
const target = new URL(origin);
if (target.username || target.password || target.search || target.hash || target.pathname !== "/") {
  throw new Error("BURGER_API_ORIGIN deve conter somente a origem da API.");
}
const isProduction = !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
if (isProduction && target.protocol !== "https:") throw new Error("APIs externas exigem HTTPS.");

if (apply && isProduction && !allowProduction) {
  throw new Error(
    "Produção bloqueada. Uma autorização específica exige também --allow-production.",
  );
}

const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const cookies = new Map();
let csrf = "";
const report = {
  startedAt: new Date().toISOString(),
  origin,
  mode: apply ? "apply" : checkAccess ? "check-access" : "dry-run",
  status: "running",
  authenticated: false,
  requests: [],
  created: [],
  skipped: [],
  beforeCount: null,
  afterCount: null,
  historicalRecordsUnchanged: null,
};
async function saveReport() {
  if (!reportPath) return;
  await mkdir(dirname(reportPath), { recursive: true });
  // Only the explicitly constructed report is persisted: never cookies, CSRF,
  // credentials, request bodies or raw authentication responses.
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function updateCookies(headers) {
  for (const header of headers.getSetCookie?.() ?? []) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function request(path, options = {}) {
  const method = options.method ?? "GET";
  const response = await fetch(`${origin}${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookies.size
        ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") }
        : {}),
      ...(method !== "GET" && csrf ? { "X-CSRF-TOKEN": csrf } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  updateCookies(response.headers);
  report.requests.push({ method, path, status: response.status });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`${method} ${path} falhou (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (data?.csrfToken) csrf = data.csrfToken;
  return data;
}

function matchesIdentity(record, planned) {
  const name = normalize(planned.name);
  const prefix = name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    normalize(record.name) === name || /^(.*)-[a-f0-9]{12}$/.exec(record.code ?? "")?.[1] === prefix
  );
}

function verifyFields(record, planned) {
  return Object.entries(planned).every(([key, value]) => record[key] === value);
}

async function main() {
  const publicProducts = await request("/api/products");
  if (!Array.isArray(publicProducts)) throw new Error("Resposta inválida do catálogo.");
  report.beforeCount = publicProducts.length;
  const missing = products.filter(
    (p) => !publicProducts.some((record) => matchesIdentity(record, p)),
  );
  console.log(`${missing.length} de ${products.length} produtos ainda não existem em ${origin}.`);
  for (const product of missing) console.log(`- ${product.name} · R$ ${product.price.toFixed(2)}`);
  if (!apply && !checkAccess) {
    report.status = "dry-run-complete";
    console.log("Simulação concluída. Nenhum dado foi alterado.");
    return;
  }

  const email = process.env.BURGER_ADMIN_EMAIL;
  const password = process.env.BURGER_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error("Acesso privado necessário: informe as credenciais no terminal interativo.");
  await request("/api/admin/auth/login");
  if (!csrf) throw new Error("A API não forneceu o token CSRF anônimo.");
  await request("/api/admin/auth/login", { method: "POST", body: { email, password } });
  const session = await request("/api/admin/auth/me");
  if (session?.role !== "Owner" || !session.csrfToken)
    throw new Error("Sessão administrativa inválida.");
  report.authenticated = true;
  await request("/api/admin/products");
  if (checkAccess) {
    report.status = "access-validated";
    console.log("Acesso Owner validado com CSRF. Nenhum produto foi gravado.");
    return;
  }

  const baseline = new Map(
    publicProducts.map((product) => [product.code, JSON.stringify(product)]),
  );
  await saveReport();
  for (const product of products) {
    // Recheck immediately before each write, including inactive and renamed
    // records, and never reactivate/update a historical product implicitly.
    const currentPublic = await request("/api/products");
    const currentAdmin = await request("/api/admin/products");
    const publicMatches = currentPublic.filter((record) => matchesIdentity(record, product));
    const adminMatches = currentAdmin.filter((record) => matchesIdentity(record, product));
    if (publicMatches.length || adminMatches.length) {
      if (publicMatches.length > 1 || adminMatches.length > 1)
        throw new Error(
          `Duplicidade ambígua: ${product.name}. Nenhuma gravação adicional realizada.`,
        );
      report.skipped.push({
        name: product.name,
        id: adminMatches[0]?.id ?? null,
        code: publicMatches[0]?.code ?? null,
        reason: "already-exists",
      });
      console.log(`Preservado por duplicidade: ${product.name}`);
      continue;
    }
    const created = await request("/api/admin/products", { method: "POST", body: product });
    if (!Number.isSafeInteger(created?.id) || created.id <= 0)
      throw new Error(
        `A API não retornou um ID válido para ${product.name}. Confira antes de repetir.`,
      );
    const entry = {
      name: product.name,
      id: created.id,
      code: null,
      price: product.price,
      verified: false,
    };
    report.created.push(entry);
    await saveReport();
    const adminAfter = await request("/api/admin/products");
    const saved = adminAfter.find((record) => record.id === created.id);
    const publicAfter = await request("/api/products");
    const visible = publicAfter.filter((record) => matchesIdentity(record, product));
    const publicFields = { ...product };
    delete publicFields.costPrice;
    if (
      !saved ||
      !verifyFields(saved, product) ||
      visible.length !== 1 ||
      !verifyFields(visible[0], publicFields) ||
      !visible[0].code
    ) {
      throw new Error(
        `Conferência divergente após cadastrar ${product.name} (ID ${created.id}). Operação interrompida sem alterar históricos.`,
      );
    }
    entry.code = visible[0].code;
    entry.verified = true;
    await saveReport();
    console.log(`Criado e conferido: ${product.name} · ID ${entry.id} · código ${entry.code}`);
  }
  const after = await request("/api/products");
  report.afterCount = after.length;
  const byCode = new Map(after.map((record) => [record.code, JSON.stringify(record)]));
  report.historicalRecordsUnchanged = [...baseline].every(
    ([code, value]) => byCode.get(code) === value,
  );
  if (!report.historicalRecordsUnchanged)
    throw new Error(
      "A conferência detectou mudança em um registro anterior. Não foram enviados PATCH, DELETE ou migrations; confira alterações concorrentes.",
    );
  report.status = "completed";
  console.log(
    `Concluído: ${report.created.length} cadastrados, ${report.skipped.length} preservados. Históricos conferidos sem alteração.`,
  );
}

try {
  await main();
} catch (error) {
  report.status = error.status === 401 ? "blocked-unauthorized" : "stopped";
  report.error = error instanceof Error ? error.message : "Falha na operação.";
  console.error(report.error);
  if (error.status === 401)
    console.error(
      "HTTP 401: cadastro interrompido. Use a recuperação oficial do Owner somente com autorização específica. Nenhum reset foi executado.",
    );
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await saveReport();
}
