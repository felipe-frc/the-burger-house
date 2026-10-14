const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_PATH = /^\/api\/product-images\/[a-f0-9]{32}\.webp$/;

function apiOrigin() {
  // Keep image operations on the same origin as the admin client.
  return window.location.origin;
}

function imageAddress(path) {
  if (typeof path !== "string" || !IMAGE_PATH.test(path)) {
    return "";
  }

  return new URL(path, apiOrigin()).href;
}

async function imageRequest(request, productId, method, body) {
  const session = await request("auth/me");
  const csrf = session?.csrfToken;

  if (typeof csrf !== "string" || !csrf) {
    throw new Error("Sessao sem token de seguranca. Entre novamente.");
  }

  const url = new URL(
    `/api/admin/products/${productId}/image`,
    apiOrigin()
  );

  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "X-CSRF-TOKEN": csrf
    },
    ...(body ? { body } : {})
  });

  if (!response.ok) {
    let message = "Nao foi possivel atualizar a fotografia.";

    try {
      const result = await response.json();

      if (typeof result.error === "string") {
        message = result.error;
      }
    } catch {
      // Preserve the generic error.
    }

    throw new Error(message);
  }

  return response.status === 204 ? null : response.json();
}

function attachImageEditor(form, request) {
  if (form.dataset.imageEditorReady === "true") {
    return;
  }

  const id = Number(form.dataset.product);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return;
  }

  form.dataset.imageEditorReady = "true";

  const section = document.createElement("section");
  section.className = "product-image-editor";
  section.style.cssText =
    "border:1px solid #ccc;border-radius:10px;padding:14px;margin:16px 0";

  const title = document.createElement("strong");
  title.textContent = "Fotografia do produto";

  const preview = document.createElement("img");
  preview.alt = "Fotografia atual";
  preview.style.cssText =
    "display:none;width:160px;height:120px;object-fit:cover;" +
    "border-radius:8px;margin:12px 0";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.setAttribute("aria-label", "Escolher fotografia");
  input.style.display = "block";
  input.style.marginTop = "12px";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Salvar fotografia";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remover fotografia";

  for (const button of [save, remove]) {
    button.style.cssText =
      "padding:8px 12px;margin:12px 8px 0 0;" +
      "border:1px solid #777;border-radius:8px";
  }

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.style.marginTop = "10px";

  section.append(title, preview, input, save, remove, status);
  form.appendChild(section);

  let currentPath = null;

  function renderPreview() {
    const url = imageAddress(currentPath);

    if (url) {
      preview.src = url;
      preview.style.display = "block";
    } else {
      preview.removeAttribute("src");
      preview.style.display = "none";
    }

    remove.disabled = !url;
  }

  function busy(active) {
    input.disabled = active;
    save.disabled = active;
    remove.disabled = active || !currentPath;
  }

  async function load() {
    try {
      const products = await request("products");

      if (!form.isConnected || !Array.isArray(products)) {
        return;
      }

      const product = products.find((item) => item.id === id);
      currentPath = product?.imageUrl ?? null;
      renderPreview();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Falha ao carregar fotografia.";
    }
  }

  preview.addEventListener("error", () => {
    preview.style.display = "none";
  });

  save.addEventListener("click", async () => {
    const file = input.files?.[0];

    if (!file) {
      status.textContent = "Escolha uma fotografia.";
      return;
    }

    if (!TYPES.has(file.type) ||
        file.size <= 0 ||
        file.size > MAX_SIZE) {
      status.textContent = "Use JPG, PNG ou WebP de ate 5 MB.";
      return;
    }

    busy(true);
    status.textContent = "Enviando fotografia...";

    try {
      const body = new FormData();
      body.append("file", file);

      const result = await imageRequest(request, id, "POST", body);

      currentPath = result.imageUrl;
      input.value = "";
      renderPreview();

      status.textContent = "Fotografia salva com sucesso.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Falha no upload.";
    } finally {
      busy(false);
    }
  });

  remove.addEventListener("click", async () => {
    if (!currentPath) {
      return;
    }

    busy(true);
    status.textContent = "Removendo fotografia...";

    try {
      await imageRequest(request, id, "DELETE");

      currentPath = null;
      input.value = "";
      renderPreview();

      status.textContent = "Fotografia removida.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Falha ao remover.";
    } finally {
      busy(false);
    }
  });

  renderPreview();
  void load();
}

export function setupProductImages(root, request) {
  const attach = () => {
    root.querySelectorAll("form[data-product]").forEach((form) => {
      attachImageEditor(form, request);
    });
  };

  attach();

  const observer = new MutationObserver(attach);

  observer.observe(root, {
    childList: true,
    subtree: true
  });
}