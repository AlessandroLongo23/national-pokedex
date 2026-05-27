import type { CardSort } from "../../_lib/card-sort";
import type {
  CardFiltersFeatures,
  CardsFilterState,
} from "./types";

export interface ToolbarProps {
  filters: CardsFilterState;
  onFiltersChange: (next: CardsFilterState) => void;
  sort: CardSort;
  onSortChange: (next: CardSort) => void;
  cols: number;
  onColsChange: (next: number) => void;
  resultCount: number;
  totalCount: number;
  artists: string[];
  types: string[];
  features?: CardFiltersFeatures;
}
