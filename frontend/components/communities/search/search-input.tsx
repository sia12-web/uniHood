"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";

import { useTypeahead } from "@/hooks/communities/use-typeahead";
import { getTypeaheadScope } from "@/hooks/communities/use-search";
import type { TypeaheadResult, TypeaheadScope } from "@/lib/community-search";
import type { SearchScope } from "@/utils/search";

const SCOPE_OPTIONS: Array<{ label: string; scope: TypeaheadScope }> = [
  { label: "All", scope: "all" },
  { label: "Groups", scope: "groups" },
  { label: "Posts", scope: "posts" },
  { label: "Events", scope: "events" },
];

export type SearchInputProps = {
  scope: SearchScope;
  typeaheadScope: TypeaheadScope;
  query: string;
  onQueryChange(value: string): void;
  onSubmit(value: string): void;
  onSuggestionSelect(suggestion: TypeaheadResult): void;
  onScopeChange(scope: TypeaheadScope): void;
};

export function SearchInput({
  scope,
  typeaheadScope,
  query,
  onQueryChange,
  onSubmit,
  onSuggestionSelect,
  onScopeChange,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(query);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const comboboxId = useId();

  useEffect(() => {
    setLocalValue(query);
  }, [query]);

  const effectiveScope = useMemo<TypeaheadScope>(() => typeaheadScope ?? getTypeaheadScope(scope), [scope, typeaheadScope]);
  const typeahead = useTypeahead(effectiveScope, localValue);

  const suggestions = typeahead.suggestions;

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
    } else if (activeIndex >= suggestions.length) {
      setActiveIndex(suggestions.length - 1);
    }
  }, [activeIndex, isOpen, suggestions.length]);

  const handleSubmit = useCallback(() => {
    onSubmit(localValue.trim());
    setIsOpen(false);
  }, [localValue, onSubmit]);

  const handleSelect = useCallback(
    (item: TypeaheadResult) => {
      onSuggestionSelect(item);
      setIsOpen(false);
      setLocalValue(item.label);
    },
    [onSuggestionSelect],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-600">
          {SCOPE_OPTIONS.map((option) => {
            const selected = option.scope === effectiveScope;
            return (
              <button
                key={option.scope}
                type="button"
                className={clsx(
                  "rounded-full px-4 py-1 transition",
                  selected ? "bg-white shadow" : "opacity-70 hover:opacity-100",
                )}
                aria-pressed={selected ? "true" : "false"}
                onClick={() => onScopeChange(option.scope)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs font-medium text-slate-500">
          {typeahead.isRateLimited
            ? `Too many requests${typeahead.retryAfter ? `, retry in ${typeahead.retryAfter}s` : ""}`
            : null}
        </div>
      </div>
      <div
        role="combobox"
        aria-expanded={isOpen ? "true" : "false"}
        aria-controls={`${comboboxId}-list`}
        aria-activedescendant={activeIndex >= 0 ? `${comboboxId}-option-${activeIndex}` : undefined}
        className="relative"
      >
        <input
          className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-base shadow-sm focus:border-slate-400 focus:outline-none"
          placeholder="Search groups, posts, events…"
          value={localValue}
          onChange={(event) => {
            setLocalValue(event.target.value);
            onQueryChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Delay close to allow click selection
            setTimeout(() => setIsOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((prev) => Math.max(prev - 1, -1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (activeIndex >= 0 && suggestions[activeIndex]) {
                handleSelect(suggestions[activeIndex]);
              } else {
                handleSubmit();
              }
            }
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
        />
        {isOpen && suggestions.length > 0 ? (
          <ul
            id={`${comboboxId}-list`}
            role="listbox"
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
          >
            {suggestions.map((item, index) => {
              const selected = index === activeIndex;
              return (
                <li
                  key={`${item.scope}-${item.id}`}
                  id={`${comboboxId}-option-${index}`}
                  role="option"
                  aria-selected={selected ? "true" : "false"}
                  className={clsx(
                    "flex cursor-pointer flex-col gap-1 border-b border-slate-100 px-4 py-3 text-sm last:border-none",
                    selected ? "bg-slate-100" : "hover:bg-slate-50",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(item);
                  }}
                >
                  <span className="font-semibold text-slate-800">{item.label}</span>
                  {item.description ? (
                    <span className="text-xs text-slate-500">{item.description}</span>
                  ) : null}
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{item.scope}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
