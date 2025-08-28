import ClientOnly from "./ClientOnly";

export const dynamicParams = false;

export function generateStaticParams() {
  const SPENDERS = [
    "joint",
    "you",
    "spouse",
    "primary",
    "secondary",
    "husband",
    "wife",
    "mike",
    "beth",
  ];
  return SPENDERS.map((slug) => ({ slug }));
}

export default function DemoSpenderPage({
  params,
}: {
  params: { slug: string };
}) {
  return <ClientOnly slug={params.slug} />;
}
