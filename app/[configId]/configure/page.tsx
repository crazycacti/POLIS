import { notFound } from "next/navigation";

import { ConfigureWorkspace } from "@/components/setup/configure-workspace";
import { loadConfigurePageServerProps } from "@/lib/configure-page";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { getPolisConfig } from "@/lib/polis-config-store";
import { configurePageMetadata } from "@/lib/site-seo";

export const dynamic = "force-dynamic";

export const metadata = configurePageMetadata;

export default async function ConfigProfileConfigurePage({
  params,
}: {
  params: Promise<{ configId: string }>;
}) {
  const { configId } = await params;
  if (!isValidPolisConfigId(configId)) {
    notFound();
  }
  if (!getPolisConfig(configId)) {
    notFound();
  }

  const serverProps = await loadConfigurePageServerProps();
  return <ConfigureWorkspace {...serverProps} routeConfigId={configId} />;
}
