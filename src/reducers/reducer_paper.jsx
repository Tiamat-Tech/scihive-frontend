import { isEmpty } from 'lodash';
import {
  CLEAR_PAPER,
  READING_PROGRESS,
  SET_BOOKMARK,
  SET_DOCUMENT,
  SET_REFERNCES,
  SET_SECTIONS,
  SET_HIGHLIGHTS,
  ADD_HIGHLIGHT,
  UPDATE_HIGHLIGHT,
  REMOVE_HIGHLIGHT,
  TOGGLE_HIGHLIGHTS
} from '../actions';

const initialState = {
  readingProgress: 0,
  isBookmarked: false,
  document: undefined,
  sections: undefined,
  references: {},
  highlights: [],
  hiddenHighlights: []
};

const updateHighlight = (state, newHighlight) => {
  const highlights = state.highlights.map(h =>
    h.id === newHighlight.id ? newHighlight : h
  );
  return {
    ...state,
    highlights
  };
};

export default function dataReducer(state = initialState, action) {
  switch (action.type) {
    case CLEAR_PAPER:
      return initialState;
    case READING_PROGRESS:
      return { ...state, readingProgress: action.payload };
    case SET_BOOKMARK:
      return { ...state, isBookmarked: action.payload };
    case SET_DOCUMENT:
      return { ...state, document: action.payload };
    case SET_SECTIONS:
      return { ...state, sections: action.payload };
    case SET_REFERNCES:
      return { ...state, references: action.payload };
    case SET_HIGHLIGHTS:
      return { ...state, highlights: action.payload };
    case ADD_HIGHLIGHT:
      return { ...state, highlights: [action.payload, ...state.highlights] };
    case UPDATE_HIGHLIGHT:
      return updateHighlight(state, action.payload);
    case REMOVE_HIGHLIGHT:
      return {
        ...state,
        highlights: state.highlights.filter(h => h.id !== action.payload)
      };
    case TOGGLE_HIGHLIGHTS:
      if (isEmpty(state.hiddenHighlights)) {
        return {
          ...state,
          highlights: [],
          hiddenHighlights: state.highlights
        };
      }
      return {
        ...state,
        highlights: [...state.highlights, ...state.hiddenHighlights],
        hiddenHighlights: []
      };
    default:
      return state;
  }
}
