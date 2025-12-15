"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface DropdownProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export default function CustomDropdown({ options, value, onChange }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative w-full">
      {/* Dropdown button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex justify-between items-center px-4 py-3 
          rounded-xl border border-zinc-700 bg-zinc-900 text-white
          transition-all duration-300 ease-out
          hover:border-indigo-500 hover:shadow-[0_0_10px_rgba(99,102,241,0.4)]
          focus:ring-2 focus:ring-indigo-500 focus:shadow-[0_0_15px_rgba(99,102,241,0.6)]
          outline-none`}
      >
        <span>{value}</span>
        <ChevronDown
          className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ${
            isOpen ? "rotate-180 text-indigo-400" : ""
          }`}
        />
      </button>

      {/* Dropdown options */}
      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/95 
                       shadow-lg backdrop-blur-md overflow-hidden z-50"
          >
            {options.map((opt) => (
              <li
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`px-4 py-3 cursor-pointer text-sm text-zinc-200 transition-all duration-200 
                            hover:bg-indigo-600 hover:text-white hover:shadow-[inset_0_0_10px_rgba(99,102,241,0.6)]`}
              >
                {opt}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
