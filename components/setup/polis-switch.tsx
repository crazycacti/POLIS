"use client";

export function PolisSwitch(props: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <label
      className={`polis-switch ${props.disabled ? "polis-switch--disabled" : ""}`}
    >
      <input
        aria-label={props["aria-label"]}
        checked={props.checked}
        className="polis-switch-input"
        disabled={props.disabled}
        onChange={(e) => {
          props.onChange(e.target.checked);
          e.target.focus({ preventScroll: true });
        }}
        type="checkbox"
      />
      <span className="polis-switch-slider">
        <span className="polis-switch-circle">
          <svg
            aria-hidden
            className="polis-switch-icon polis-switch-check"
            viewBox="0 0 12 10"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 5.5L4 8.5L11 1.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <svg
            aria-hidden
            className="polis-switch-icon polis-switch-cross"
            viewBox="0 0 10 10"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L9 9M9 1L1 9"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.75"
            />
          </svg>
        </span>
      </span>
    </label>
  );
}
