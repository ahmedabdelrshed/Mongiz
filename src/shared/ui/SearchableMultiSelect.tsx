import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export function SearchableMultiSelect({
  label,
  options,
  value,
  onChange,
  allValue,
  disabled = false,
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Selecting this option clears every specific selection. */
  allValue: string;
  disabled?: boolean;
}) {
  const selected = options.filter((option) => value.includes(option.value));
  const selectedLabel = value.includes(allValue)
    ? (options.find((option) => option.value === allValue)?.label ?? "All")
    : selected.length === 1
      ? selected[0].label
      : `${selected.length} selected`;
  const choose = (optionValue: string) => {
    if (optionValue === allValue) {
      onChange([allValue]);
      return;
    }
    const next = value.filter((current) => current !== allValue);
    const toggled = next.includes(optionValue)
      ? next.filter((current) => current !== optionValue)
      : [...next, optionValue];
    onChange(toggled.length ? toggled : [allValue]);
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="multi-select-trigger"
          aria-label={label}
          disabled={disabled}
        >
          <span>{selectedLabel}</span>
          <ChevronsUpDown size={15} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="multi-select-popover"
          align="start"
          sideOffset={6}
          role="dialog"
          aria-label={`${label} options`}
        >
          <Command>
            <div className="multi-select-search">
              <Search size={15} aria-hidden="true" />
              <Command.Input
                aria-label={`Search ${label}`}
                placeholder={`Search ${label.toLowerCase()}...`}
              />
            </div>
            <Command.List>
              <Command.Empty>No matching options.</Command.Empty>
              {options.map((option) => {
                const checked = value.includes(option.value);
                return (
                  <Command.Item
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => choose(option.value)}
                  >
                    <span
                      className={`multi-select-check ${checked ? "checked" : ""}`}
                      aria-hidden="true"
                    >
                      {checked && <Check size={13} />}
                    </span>
                    {option.label}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
