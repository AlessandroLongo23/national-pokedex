import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");

interface Repo {
  url: string;
  dir: string;
}

const REPOS: Repo[] = [
  {
    url: "https://github.com/PokemonTCG/pokemon-tcg-data.git",
    dir: path.join(CACHE_DIR, "pokemon-tcg-data"),
  },
  {
    url: "https://github.com/smogon/pokemon-showdown.git",
    dir: path.join(CACHE_DIR, "pokemon-showdown"),
  },
];

export function fetchSources(): { tcgDataDir: string; showdownDir: string } {
  for (const repo of REPOS) {
    if (existsSync(repo.dir)) {
      console.log(`[fetch] ${path.basename(repo.dir)}: already cached, pulling latest`);
      execSync(`git -C "${repo.dir}" pull --ff-only`, { stdio: "inherit" });
    } else {
      console.log(`[fetch] cloning ${repo.url} → ${repo.dir}`);
      execSync(`git clone --depth=1 "${repo.url}" "${repo.dir}"`, { stdio: "inherit" });
    }
  }
  return {
    tcgDataDir: REPOS[0]!.dir,
    showdownDir: REPOS[1]!.dir,
  };
}
