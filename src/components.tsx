import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  Home,
  Plane,
  Car,
  GraduationCap,
  ShieldCheck,
  Target,
} from "lucide-react";
export const categoryIcons = {
  Home,
  Travel: Plane,
  Transport: Car,
  Education: GraduationCap,
  Emergency: ShieldCheck,
  Other: Target,
};
export function GoalIcon({
  category,
  color = "sage",
}: {
  category: string;
  color?: string;
}) {
  const Icon = categoryIcons[category as keyof typeof categoryIcons] || Target;
  return (
    <span className={`goal-icon ${color}`}>
      <Icon size={22} strokeWidth={1.6} />
    </span>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase().replace(" ", "-")}`}>
      <i />
      {value}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Target size={28} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <header>
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Stat({
  label,
  value,
  caption,
  featured = false,
}: {
  label: string;
  value: string;
  caption: string;
  featured?: boolean;
}) {
  return (
    <div className={`stat ${featured ? "featured" : ""}`}>
      <div className="stat-label">
        {label}
        <ArrowUpRight size={18} />
      </div>
      <div className="stat-value">{value}</div>
      <p>{caption}</p>
    </div>
  );
}
export function downloadJson(data: unknown) {
  const blob = new Blob(
    [
      JSON.stringify(
        { exported_at: new Date().toISOString(), ...(data as object) },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `finance-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
