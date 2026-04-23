"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { CartItem } from "@/context/CartContext";

// loadStripe se memoiza fuera del render para evitar recrear el objeto Stripe
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe(): Promise<StripeJs | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

type Props = {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  mesa: string;
  totalAmount: number;
  labels: {
    title: string;
    subtitle: string;
    payNow: string;
    close: string;
    errorGeneric: string;
  };
};

// Formulario interno — usa hooks de @stripe/react-stripe-js que requieren estar dentro de <Elements>
function CheckoutForm({
  totalAmount,
  onClose,
  labels,
}: Pick<Props, "totalAmount" | "onClose" | "labels">) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setErrorMsg("");
    setSubmitting(true);

    const origin = window.location.origin;
    // Sólo se redirige si el método lo requiere (Bizum, Klarna, etc).
    // Tarjeta / Apple Pay / Google Pay suelen terminar inline y el webhook lo marca paid.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${origin}/success?mesa=${encodeURIComponent(window.location.pathname.split("/")[1] || "1")}`,
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMsg(error.message || labels.errorGeneric);
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      // Redirigimos manualmente para flujos que no han redireccionado solos.
      window.location.href = `${origin}/success?mesa=${encodeURIComponent(window.location.pathname.split("/")[1] || "1")}`;
      return;
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={onSubmit} className="pay-form">
      <PaymentElement options={{ layout: "tabs" }} />

      {errorMsg && (
        <div className="pay-form-error" role="alert">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        className="gold-button pay-submit"
        disabled={!stripe || !elements || submitting}
        aria-busy={submitting}
      >
        {submitting ? (
          <Loader2 size={18} className="spin" aria-hidden="true" />
        ) : (
          `${labels.payNow} · ${totalAmount.toFixed(2)}€`
        )}
      </button>

      <button type="button" className="pay-cancel" onClick={onClose} disabled={submitting}>
        {labels.close}
      </button>

      <style jsx>{`
        .pay-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.5rem;
          background: #fff;
        }
        .pay-form-error {
          background: #fee6e6;
          color: #8b1e1e;
          padding: 0.7rem 0.9rem;
          border-radius: 10px;
          font-size: 0.85rem;
          line-height: 1.4;
        }
        .pay-submit {
          width: 100%;
          justify-content: center;
          padding: 1.1rem;
          font-size: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .pay-cancel {
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 0.75rem;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.85rem;
          text-decoration: underline;
        }
        .pay-cancel:hover:not(:disabled) {
          color: var(--text);
        }
        .pay-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </form>
  );
}

export default function CheckoutDialog({ open, onClose, items, mesa, totalAmount, labels }: Props) {
  const [clientSecret, setClientSecret] = useState("");
  const [loadError, setLoadError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pide un PaymentIntent cuando se abre el diálogo
  useEffect(() => {
    if (!open) {
      setClientSecret("");
      setLoadError("");
      abortRef.current?.abort();
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    (async () => {
      try {
        const res = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, mesa }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || labels.errorGeneric);
        setClientSecret(data.clientSecret);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError(err instanceof Error ? err.message : labels.errorGeneric);
      }
    })();
    return () => ctrl.abort();
  }, [open, items, mesa, labels.errorGeneric]);

  // Cierra con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Bloquea scroll del body
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const appearance = {
    theme: "stripe" as const,
    variables: {
      colorPrimary: "#7B4F96",
      colorBackground: "#ffffff",
      colorText: "#111111",
      colorDanger: "#8B1E1E",
      fontFamily: "Inter, system-ui, sans-serif",
      borderRadius: "10px",
    },
  };

  return (
    <div className="checkout-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="checkout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="checkout-close"
          onClick={onClose}
          aria-label={labels.close}
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="checkout-header">
          <h2 id="checkout-title" className="serif">
            {labels.title}
          </h2>
          <p>{labels.subtitle}</p>
        </div>

        {loadError && (
          <div className="checkout-error" role="alert">
            {loadError}
          </div>
        )}

        {!clientSecret && !loadError && (
          <div className="checkout-loading" role="status" aria-live="polite">
            <Loader2 size={24} className="spin" aria-hidden="true" />
          </div>
        )}

        {clientSecret && (
          <Elements stripe={getStripe()} options={{ clientSecret, appearance }}>
            <CheckoutForm totalAmount={totalAmount} onClose={onClose} labels={labels} />
          </Elements>
        )}
      </div>

      <style jsx>{`
        .checkout-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 300;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
          overscroll-behavior: contain;
          animation: fade-in 0.2s ease;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .checkout-dialog {
          position: relative;
          width: 100%;
          max-width: 500px;
          background: #fff;
          border-radius: 20px 20px 14px 14px;
          overflow-y: auto;
          max-height: calc(100vh - 2rem);
          max-height: calc(100dvh - 2rem);
          box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);
        }
        .checkout-close {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          z-index: 2;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: #f4f4f4;
          color: var(--text);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .checkout-close:hover {
          background: #e8e8e8;
        }
        .checkout-header {
          padding: 1.5rem 1.5rem 0.5rem;
          text-align: center;
        }
        .checkout-header h2 {
          margin: 0 0 0.3rem;
          font-size: 1.35rem;
          color: var(--text);
        }
        .checkout-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .checkout-loading {
          display: flex;
          justify-content: center;
          padding: 2.5rem;
          color: var(--primary);
        }
        .checkout-error {
          margin: 1rem 1.5rem;
          padding: 0.9rem 1rem;
          background: #fee6e6;
          color: #8b1e1e;
          border-radius: 10px;
          font-size: 0.9rem;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
