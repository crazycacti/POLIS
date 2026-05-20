import { listStaticDemoPosterPreloadPaths } from "@/lib/demo-poster-static";

export function DemoPosterPreload() {
  const hrefs = listStaticDemoPosterPreloadPaths();
  return (
    <>
      {hrefs.map((href) => (
        <link key={href} as="image" href={href} rel="preload" />
      ))}
    </>
  );
}
