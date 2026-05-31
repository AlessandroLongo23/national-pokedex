import type { CardSort, SortDir } from "../../_lib/card-sort";
import type {
  CardFiltersFeatures,
  CardsFilterState,
} from "./types";

export type CardView = "grid" | "list";

export interface ToolbarProps {
  filters: CardsFilterState;
  onFiltersChange: (next: CardsFilterState) => void;
  sort: CardSort;
  onSortChange: (next: CardSort) => void;
  sortDir: SortDir;
  onSortDirChange: (next: SortDir) => void;
  /** Which sort fields the dropdown offers, in order. Defaults to the catalog set. */
  sortOptions?: CardSort[];
  cols: number;
  onColsChange: (next: number) => void;
  resultCount: number;
  totalCount: number;
  artists: string[];
  types: string[];
  features?: CardFiltersFeatures;
  // When provided, the toolbar shows a grid/list view toggle and hides the
  // column-size slider in list view (where it has no meaning).
  view?: CardView;
  onViewChange?: (next: CardView) => void;
}
