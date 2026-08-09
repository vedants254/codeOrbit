import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.github.com/repos/YOUR_USERNAME/GitVizz', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitVizz',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error('Failed to fetch GitHub stars');
    }

    const data = await response.json();
    return NextResponse.json({ stars: data.stargazers_count });
  } catch (error) {
    console.error('Error fetching GitHub stars:', error);
    // Return fallback value
    return NextResponse.json({ stars: 37 });
  }
}
