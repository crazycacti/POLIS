import Link from "next/link";

export function InstallGuide() {
  return (
    <ol className="polis-steps">
      <li>
        <span className="polis-step-title">Open Aurora Media Center</span>
        <span className="polis-step-body">
          Use the desktop app or{" "}
          <Link
            className="text-cyan-400/90 underline decoration-cyan-600/50 underline-offset-2 hover:text-cyan-300"
            href="https://auroramediacenter.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            visit auroramediacenter.com
          </Link>
          .
        </span>
      </li>
      <li>
        <span className="polis-step-title">Open addons</span>
        <span className="polis-step-body">Find the addons section in the app menu.</span>
      </li>
      <li>
        <span className="polis-step-title">Install from URL</span>
        <span className="polis-step-body">
          Choose manual install or paste-from-URL (wording varies by version).
        </span>
      </li>
      <li>
        <span className="polis-step-title">Paste your POLIS link</span>
        <span className="polis-step-body">
          Paste the install URL from configure and confirm. The app loads POLIS from that address.
        </span>
      </li>
    </ol>
  );
}
