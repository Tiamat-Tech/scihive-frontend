import axios from 'axios';
import produce from 'immer';
import { GetState } from 'zustand';
import { Category, PaperListItem } from '../models';
import { AddRemovePaperToGroup, addRemovePaperToGroupHelper, createWithDevtools, NamedSetState } from './utils';

interface PapersListState {
  papers: PaperListItem[];
  totalPapers: number;
  allCategories: Category[];
  selectedCategories: string[];
  isCategoriesModalOpen: boolean;
}

const initialState: PapersListState = {
  papers: [],
  totalPapers: 0,
  allCategories: [],
  selectedCategories: [],
  isCategoriesModalOpen: false,
};

export interface RequestParams {
  age: string;
  q: string;
  sort: string;
  author: string;
  page_num: number;
  group: string;
  library: boolean;
}

interface FetchPapers {
  url: string;
  requestParams: Partial<RequestParams>;
  setHasMorePapers: (value: boolean) => void;
  finallyCb: () => void;
}

const stateAndActions = (set: NamedSetState<PapersListState>, get: GetState<PapersListState>) => {
  const addPapersHelper = ({ papers, total }: { papers: PaperListItem[]; total?: number }) =>
    set(state => {
      const totalPapers = total !== undefined ? total : state.totalPapers;
      return { papers: [...state.papers, ...papers], totalPapers };
    }, 'addPapers');

  const clearPapersHelper = () => set(state => ({ papers: [], totalPapers: 0 }), 'clearPapers');

  return {
    ...initialState,
    clearPapers: () => set(state => ({ papers: [], totalPapers: 0 }), 'clearPapers'),
    fetchPapers: async ({ url, requestParams, setHasMorePapers, finallyCb }: FetchPapers) => {
      const page = requestParams.page_num;
      try {
        const result = await axios.get(url, { params: requestParams });
        const newPapers = result.data.papers;
        console.log(newPapers);
        // Everytime we load page 0 we assume it's a new query
        if (page === 1) {
          clearPapersHelper();
        }
        addPapersHelper({ papers: newPapers, total: page === 1 ? result.data.count : undefined });
        setHasMorePapers(newPapers.length !== 0);
      } catch (e) {
        console.warn('Failed to load content', e);
        setHasMorePapers(false);
      } finally {
        finallyCb();
      }
    },
    updatePaperGroups: (payload: AddRemovePaperToGroup) => {
      try {
        addRemovePaperToGroupHelper(payload);
      } catch (e) {
        console.log(e);
        return;
      }
      set(
        produce((draftState: PapersListState) => {
          for (const paper of draftState.papers) {
            if (paper.id === payload.paperId) {
              if (payload.shouldAdd) {
                paper.groups.push(payload.groupId);
              } else {
                paper.groups = paper.groups.filter(g => g !== payload.groupId);
              }
            }
          }
          return draftState;
        }),
        'updateGroups',
      );
    },
  };
};

export const [usePapersListStore, papersListStoreApi] = createWithDevtools(stateAndActions, 'PapersList');
