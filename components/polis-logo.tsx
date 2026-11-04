type PolisLogoProps = {
  className?: string;
  colorClassName?: string;
  "aria-hidden"?: boolean;
};

export function PolisLogo({
  className = "h-7 w-35",
  colorClassName = "text-white",
  "aria-hidden": ariaHidden,
}: PolisLogoProps) {
  return (
    <span
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : "POLIS"}
      className={`polis-logo-mark ${colorClassName} ${className}`.trim()}
      role={ariaHidden ? undefined : "img"}
    />
  );
}
