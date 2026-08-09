// lib/seo.ts

import type { Metadata } from 'next';

// The configuration shape for your SEO metadata
export interface SEOConfig {
  title: string;
  description: string;
  canonical?: string;
  openGraph?: {
    title?: string;
    description?: string;
    images?: Array<{
      url: string;
      width: number;
      height: number;
      alt: string;
    }>;
    type?: 'website' | 'article' | 'profile';
    siteName?: string;
    locale?: string;
  };
  twitter?: {
    card?: 'summary' | 'summary_large_image' | 'app' | 'player';
    site?: string;
    creator?: string;
    title?: string;
    description?: string;
    images?: string[];
  };
  keywords?: string[];
  authors?: Array<{ name: string; url: string }>;
  creator?: string;
  publisher?: string;
  robots?: {
    index?: boolean;
    follow?: boolean;
    googleBot?: string;
  };
  verification?: {
    google?: string;
  };
}

// Default SEO configuration for your entire site
export const baseSEOConfig: SEOConfig = {
  title: 'gitvizz - From Repo to Reasoning Instantly',
  description:
    'gitvizz helps you understand repository content easily and extract AI-ready plain text from GitHub or local files.',
  canonical: 'https://gitvizz.com',
  keywords: [
    'gitvizz',
    'GitHub Visualization',
    'Repo to Text',
    'Code to Text',
    'AI Ready Code',
    'GitHub Summary Tool',
    'Repository Analysis',
    'Code Understanding',
    'Plain Text Conversion',
    'LLM Context',
    'Repository to Text',
  ],
  authors: [{ name: 'gitvizz Team', url: 'https://gitvizz.com' }],
  creator: 'gitvizz Team',
  publisher: 'gitvizz Team',
  robots: {
    index: true,
    follow: true,
    googleBot: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'gitvizz',
    title: 'gitvizz - From Repo to Reasoning Instantly',
    description:
      'Visualize and extract code structure effortlessly. Convert repositories to AI-friendly plain text with gitvizz.',
    images: [
      {
        url: '/og-image.png', // Use the image from /public directory
        width: 1200,
        height: 630,
        alt: 'gitvizz - From Repo to Reasoning Instantly',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@your_twitter_handle', // Use your actual Twitter handle
    title: 'gitvizz - From Repo to Reasoning Instantly',
    description: 'Understand GitHub repositories visually and convert them into AI-ready formats.',
    images: ['/og-image.png'], // Use the image from /public directory
  },
};
export function generateSEOMetadata(pageConfig: Partial<SEOConfig> = {}): Metadata {
  const config = { ...baseSEOConfig };

  config.title = pageConfig.title || config.title;
  config.description = pageConfig.description || config.description;
  config.canonical = pageConfig.canonical || config.canonical;
  config.keywords = Array.from(new Set([...(config.keywords || []), ...(pageConfig.keywords || [])]));
  config.openGraph = { ...config.openGraph, ...pageConfig.openGraph };
  config.twitter = { ...config.twitter, ...pageConfig.twitter };

  return {
    metadataBase: new URL(config.canonical || 'https://codeorbit.dev'),
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    authors: config.authors,
    creator: config.creator,
    publisher: config.publisher,
    robots: config.robots,
    alternates: {
      canonical: config.canonical,
    },
    openGraph: {
      ...config.openGraph,
      title: config.openGraph?.title || config.title,
      description: config.openGraph?.description || config.description,
      url: config.canonical,
    },
    twitter: {
      ...config.twitter,
      title: config.twitter?.title || config.title,
      description: config.twitter?.description || config.description,
    },
    verification: config.verification,
  };
}

// JSON-LD structured data for rich search results
export const structuredData = {
  website: {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'gitvizz',
    url: 'https://gitvizz.com',
    description: baseSEOConfig.description,
    inLanguage: 'en-US',
  },
  softwareApplication: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'gitvizz',
    applicationCategory: 'DeveloperTool',
    operatingSystem: 'Web',
    description: baseSEOConfig.description,
    url: 'https://gitvizz.com',
    author: {
      '@type': 'Organization',
      name: 'gitvizz Team',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  },
};