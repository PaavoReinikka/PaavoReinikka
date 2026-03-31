import { graphql } from "@octokit/graphql";
import fs from "fs";
import "dotenv/config";

const TOKEN = process.env.GH_STATS_TOKEN;
const USERNAME = process.env.GH_USERNAME;
const INCLUDE_PRIVATE = process.env.INCLUDE_PRIVATE === "true";
const COMMIT_DISPLAY = process.env.COMMIT_DISPLAY || "current"; // Default to current year

if (!TOKEN || !USERNAME) {
  console.error("Error: GH_STATS_TOKEN and GH_USERNAME environment variables are required.");
  process.exit(1);
}

const query = `
  query($login: String!) {
    user(login: $login) {
      name
      repositories(ownerAffiliations: OWNER, first: 100, isFork: false) {
        nodes {
          stargazerCount
        }
      }
      pullRequests {
        totalCount
      }
      issues {
        totalCount
      }
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
        }
      }
      repositoriesContributedTo(first: 1) {
        totalCount
      }
      followers {
        totalCount
      }
    }
  }
`;

async function fetchAllTimeCommits() {
  try {
    const response = await fetch(`https://api.github.com/search/commits?q=author:${USERNAME}`, {
      headers: {
        "Authorization": `token ${TOKEN}`,
        "Accept": "application/vnd.github.cloak-preview"
      }
    });
    const data = await response.json();
    return data.total_count || 0;
  } catch (error) {
    console.warn("Could not fetch all-time commits, falling back.");
    return null;
  }
}

async function fetchStats() {
  try {
    const { user } = await graphql(query, {
      login: USERNAME,
      headers: {
        authorization: `token ${TOKEN}`,
      },
    });

    const totalStars = user.repositories.nodes.reduce((acc, repo) => acc + repo.stargazerCount, 0);
    
    let allTimeCommits = 0;
    if (COMMIT_DISPLAY === "all" || COMMIT_DISPLAY === "both") {
      allTimeCommits = await fetchAllTimeCommits() || 0;
    }

    const currentYearCommits = INCLUDE_PRIVATE 
      ? user.contributionsCollection.contributionCalendar.totalContributions
      : user.contributionsCollection.totalCommitContributions;

    return {
      name: user.name || USERNAME,
      stars: totalStars,
      allTimeCommits,
      currentYearCommits,
      prs: user.pullRequests.totalCount,
      issues: user.issues.totalCount,
      contributedTo: user.repositoriesContributedTo.totalCount,
      followers: user.followers.totalCount,
    };
  } catch (error) {
    console.error("Error fetching data from GitHub:", error.message);
    process.exit(1);
  }
}

function generateSVG(stats) {
  const { stars, allTimeCommits, currentYearCommits, prs, issues, contributedTo } = stats;
  
  const showAll = COMMIT_DISPLAY === "all" || COMMIT_DISPLAY === "both";
  const showCurrent = COMMIT_DISPLAY === "current" || COMMIT_DISPLAY === "both";
  const showBoth = COMMIT_DISPLAY === "both";

  const height = showBoth ? 220 : 195;

  return `
<svg width="495" height="${height}" viewBox="0 0 495 ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #A6E22E; animation: fadeIn 0.8s ease-in-out forwards; }
    .stat { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #66D9EF; }
    .bold { font-weight: 700; fill: #F92672; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  </style>

  <rect x="0.5" y="0.5" width="494" height="${height - 1}" rx="4.5" fill="#272822" stroke="#49483E"/>

  <text x="25" y="35" class="header">${stats.name}'s GitHub Stats</text>

  <g transform="translate(25, 60)">
    <g transform="translate(0, 0)">
      <text x="0" y="15" class="stat">Total Stars:</text>
      <text x="170" y="15" class="stat bold">${stars}</text>
    </g>
    ${showAll ? `
    <g transform="translate(0, 25)">
      <text x="0" y="15" class="stat">All-time Commits:</text>
      <text x="170" y="15" class="stat bold">${allTimeCommits}</text>
    </g>` : ''}
    ${showCurrent ? `
    <g transform="translate(0, ${showAll ? 50 : 25})">
      <text x="0" y="15" class="stat">Commits (Current Year):</text>
      <text x="170" y="15" class="stat bold">${currentYearCommits}</text>
    </g>` : ''}
    <g transform="translate(0, ${showBoth ? 75 : 50})">
      <text x="0" y="15" class="stat">Total PRs:</text>
      <text x="170" y="15" class="stat bold">${prs}</text>
    </g>
    <g transform="translate(0, ${showBoth ? 100 : 75})">
      <text x="0" y="15" class="stat">Total Issues:</text>
      <text x="170" y="15" class="stat bold">${issues}</text>
    </g>
    <g transform="translate(0, ${showBoth ? 125 : 100})">
      <text x="0" y="15" class="stat">Contributed to:</text>
      <text x="170" y="15" class="stat bold">${contributedTo}</text>
    </g>
  </g>
</svg>
  `.trim();
}

async function run() {
  console.log(`Fetching stats for ${USERNAME}...`);
  const stats = await fetchStats();
  const svg = generateSVG(stats);

  fs.writeFileSync("../github-stats.svg", svg);
  console.log("Successfully generated github-stats.svg in the root directory");
}

run();
