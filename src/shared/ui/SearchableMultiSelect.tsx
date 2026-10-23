import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { fade } from "./Motion";

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
  allowEmpty = false,
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Selecting this option clears every specific selection. */
  allValue: string;
  disabled?: boolean;
  /** Allow clearing the last option instead of reverting to allValue. */
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => value.includes(option.value));
  const selectedLabel = value.includes(allValue)
    ? (options.find((option) => option.value === allValue)?.label ?? "All")
    : !selected.length && allowEmpty
      ? "None selected"
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} selected`;
  const choose = (optionValue: string) => {
    if (optionValue === allValue) {
      onChange(allowEmpty && value.includes(allValue) ? [] : [allValue]);
      return;
    }
    const next = value.filter((current) => current !== allValue);
    const toggled = next.includes(optionValue)
      ? next.filter((current) => current !== optionValue)
      : [...next, optionValue];
    onChange(toggled.length || allowEmpty ? toggled : [allValue]);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
      {open && (
        <Popover.Portal forceMount>
          <Popover.Content
            forceMount
            asChild
            align="start"
            sideOffset={6}
            role="dialog"
            aria-label={`${label} options`}
          >
            <motion.div
              className="multi-select-popover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
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
                  {allowEmpty && value.length > 0 && (
                    <Command.Item
                      value="Clear selection"
                      onSelect={() => onChange([])}
                    >
                      Clear selection
                    </Command.Item>
                  )}
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
            </motion.div>
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
