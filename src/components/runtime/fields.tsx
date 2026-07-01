"use client";

// Field renderers. Each maps a component `type` to a controlled input. New
// component types are added here once and become available to every journey in
// every industry — the definition just references them by type.

import type { Component } from "@/modules/journeys/domain/schema";

interface FieldProps {
  component: Component;
  value: unknown;
  onChange: (value: unknown) => void;
}

const inputBase =
  "w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-white placeholder-white/40 focus-ring transition";

export function OptionList({ component, value, onChange, multi }: FieldProps & { multi?: boolean }) {
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const isOn = (v: string) => (multi ? (selected as string[]).includes(v) : selected === v);
  const toggle = (v: string) => {
    if (!multi) return onChange(v);
    const set = new Set(selected as string[]);
    set.has(v) ? set.delete(v) : set.add(v);
    onChange([...set]);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {component.options?.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`group flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition focus-ring ${
            isOn(opt.value)
              ? "border-white bg-white text-[var(--j-bg,#0b1f3a)]"
              : "border-white/25 bg-white/5 text-white hover:border-white/60 hover:bg-white/10"
          }`}
        >
          <span>
            <span className="block font-medium">{opt.label}</span>
            {opt.description && <span className="mt-0.5 block text-sm opacity-70">{opt.description}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Field({ component, value, onChange }: FieldProps) {
  const v = value ?? "";
  switch (component.type) {
    case "singleSelect":
    case "radio":
      return <OptionList component={component} value={value} onChange={onChange} />;
    case "multiSelect":
    case "checkbox":
      return <OptionList component={component} value={value} onChange={onChange} multi />;
    case "dropdown":
      return (
        <select className={inputBase} value={String(v)} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {component.options?.map((o) => (
            <option key={o.value} value={o.value} className="text-black">
              {o.label}
            </option>
          ))}
        </select>
      );
    case "longText":
      return (
        <textarea
          className={inputBase}
          rows={4}
          placeholder={component.placeholder}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
    case "currency":
      return (
        <input
          type="number"
          className={inputBase}
          placeholder={component.placeholder}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "date":
      return (
        <input type="date" className={inputBase} value={String(v)} onChange={(e) => onChange(e.target.value)} />
      );
    case "time":
      return (
        <input type="time" className={inputBase} value={String(v)} onChange={(e) => onChange(e.target.value)} />
      );
    case "email":
      return (
        <input
          type="email"
          className={inputBase}
          placeholder={component.placeholder}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "phone":
      return (
        <input
          type="tel"
          className={inputBase}
          placeholder={component.placeholder}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "shortText":
    case "address":
    default:
      return (
        <input
          type="text"
          className={inputBase}
          placeholder={component.placeholder}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
