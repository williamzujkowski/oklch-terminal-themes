// Build-time full records for the two active previews; no runtime server or fetch.
import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';
import themes from '@williamzujkowski/oklch-terminal-themes/themes.json';

export const prerender = true;

export const getStaticPaths = (() =>
  themes.map((theme) => ({
    params: { slug: theme.slug },
    props: { theme },
  }))) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET = (({ props }: { props: Props }) =>
  new Response(JSON.stringify(props.theme), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })) satisfies APIRoute<Props>;
