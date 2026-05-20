import { ConfigureWorkspace } from "@/components/setup/configure-workspace";
import { loadConfigurePageServerProps } from "@/lib/configure-page";
import { configurePageMetadata } from "@/lib/site-seo";

export const dynamic = "force-dynamic";

export const metadata = configurePageMetadata;

export default async function ConfigurePage() {
  const serverProps = await loadConfigurePageServerProps();
  return <ConfigureWorkspace {...serverProps} />;
}
