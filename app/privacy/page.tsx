import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What POLIS stores, what it sends to other services, and how to delete it.",
};

const sectionClass = "space-y-3";
const headingClass = "text-lg font-semibold text-white";
const textClass = "text-sm leading-6 text-zinc-300";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold text-white">Privacy</h1>

      <section className={sectionClass}>
        <h2 className={headingClass}>What a profile stores</h2>
        <p className={textClass}>
          When you save a profile, the server stores its poster and catalog settings, the profile name, the text of
          your own badges, the TMDB and MDBList keys you save in it, and a hash of its password. Saved keys are
          encrypted. POLIS has no accounts, emails or names.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>What stays in your browser</h2>
        <p className={textClass}>
          Keys you enter on the configure page, your saved looks and the id of your last profile are kept in this
          browser until you remove them. A sign-in cookie keeps a profile unlocked for up to 7 days, and a preview
          cookie lets the configure page show posters with your keys. POLIS uses no analytics, ads or tracking.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>What other services receive</h2>
        <p className={textClass}>
          To build posters and catalogs, the POLIS server asks TMDB, MDBList, Fanart.tv, TheTVDB and artwork sources
          for the titles you view, using the keys in your profile or the server&apos;s own keys. They receive the
          title being looked up and the key, from the server. They do not receive your IP address or browser
          details.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Server logs</h2>
        <p className={textClass}>
          Like most websites, the server that runs POLIS records your IP address and the page or image each
          request asks for, to keep the service running and safe from abuse. Install URLs contain your profile id, so keep them private.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Deleting your data</h2>
        <p className={textClass}>
          Open your profile on the configure page and choose More install options, then Delete profile. This removes
          the profile, its keys, badges and cached posters from the server. Clear this site&apos;s data in your
          browser to remove what it keeps there.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Self-hosted servers</h2>
        <p className={textClass}>
          This page describes POLIS as published. Anyone can run their own server, and its operator decides what it
          logs and keeps.
        </p>
      </section>
    </main>
  );
}
