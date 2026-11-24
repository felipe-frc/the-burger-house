import type { CheckoutForm } from "./types";

export type FieldErrors = Partial<Record<keyof CheckoutForm | "items", string>>;

export function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string) {
  const number = digits(value).slice(0, 11);
  if (number.length <= 2) return number.replace(/^(\d{0,2})/, "($1");
  if (number.length <= 7) return number.replace(/^(\d{2})(\d+)/, "($1) $2");
  return number.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export function formatCpf(value: string) {
  return digits(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatCep(value: string) {
  return digits(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

export function isValidCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculate = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculate(9) === Number(cpf[9]) && calculate(10) === Number(cpf[10]);
}

export function validateDetails(form: CheckoutForm): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.customerName.trim();
  const phone = digits(form.phone);

  if (!name) errors.customerName = "Informe seu nome completo.";
  else if (name.length > 120) errors.customerName = "Use no máximo 120 caracteres.";

  if (!/^[1-9]{2}9\d{8}$/.test(phone)) {
    errors.phone = "Informe um celular válido com DDD e nono dígito.";
  }

  if (!form.email.trim()) errors.email = "Informe seu e-mail.";
  else if (form.email.trim().length < 10 || form.email.trim().length > 60)
    errors.email = "Use um e-mail entre 10 e 60 caracteres, conforme exigido pelo PagBank.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Informe um e-mail válido.";
  }

  if (!isValidCpf(form.cpf)) errors.cpf = "Informe um CPF válido.";

  if (form.fulfillment === "delivery") {
    if (digits(form.zipCode).length !== 8) errors.zipCode = "Informe um CEP com 8 dígitos.";
    if (!form.street.trim()) errors.street = "Informe a rua.";
    else if (form.street.trim().length > 200) errors.street = "Use no máximo 200 caracteres.";
    if (!form.houseNumber.trim()) errors.houseNumber = "Informe o número.";
    else if (form.houseNumber.trim().length > 20) {
      errors.houseNumber = "Use no máximo 20 caracteres.";
    }
    if (!form.neighborhood.trim()) errors.neighborhood = "Informe o bairro.";
    else if (form.neighborhood.trim().length > 120) {
      errors.neighborhood = "Use no máximo 120 caracteres.";
    }
    if (!form.city.trim()) errors.city = "Informe a cidade.";
    else if (form.city.trim().length > 120) errors.city = "Use no máximo 120 caracteres.";
    if (form.complement.trim().length > 200) {
      errors.complement = "Use no máximo 200 caracteres.";
    }
  }

  return errors;
}

export function firstErrorField(errors: FieldErrors) {
  return Object.keys(errors)[0] as keyof FieldErrors | undefined;
}
