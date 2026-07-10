"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

export function AnimatedPage({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.42, ease }}
    >
      {children}
    </motion.section>
  );
}

export function AnimatedGroup({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: shouldReduceMotion ? {} : { staggerChildren: 0.055, delayChildren: 0.05 }
        }
      }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedItem({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: shouldReduceMotion ? {} : { opacity: 0, y: 14 },
        show: shouldReduceMotion ? {} : { opacity: 1, y: 0, transition: { duration: 0.32, ease } }
      }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedSurface({
  children,
  className,
  hover = true
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("will-change-transform", className)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      whileHover={!shouldReduceMotion && hover ? { y: -2 } : undefined}
      transition={{ duration: 0.24, ease }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedBand({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease }}
    >
      {children}
    </motion.section>
  );
}

export function AnimatedHeader({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.header
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease }}
    >
      {children}
    </motion.header>
  );
}
