/** @jsx jsx */
import { css, jsx } from '@emotion/core';
import { Chip, CircularProgress, FormControl, Grid, Input, MenuItem, Select } from '@material-ui/core';
import * as queryString from 'query-string';
import React from 'react';
import { connect } from 'react-redux';
import { RouteComponentProps, withRouter } from 'react-router';
import { actions } from '../actions/papersList';
import { PaperListItem, RootState, Group } from '../models';
import { fetchPapers, RequestParams } from '../thunks';
import * as presets from '../utils/presets';
import { CategoriesModal } from './Cateogries';
import InfiniteScroll from './InfiniteScroll';
import PapersListItem from './PapersListItem';
import { isEmpty } from 'lodash';

const formControlCss = css({
  margin: '8px 8px 8px 0px',
  minWidth: 80,
});

const spinnerEmptyStateCss = css({
  position: 'absolute',
  top: '50%',
  left: '50%',
});

const spinnerCss = css({
  textAlign: 'center',
});
const scrollWrapperCss = css({
  width: '100%',
});

const filtersCss = css`
  ${presets.row};
  align-items: center;
`;

const filterValueCss = css`
  font-size: 13px;
`;

const filterMenuItemCss = css`
  font-size: 13px;
  padding: 8px 12px;
`;

interface QueryParam {
  age: string;
  q: string;
  sort: string;
  authorId: string;
}

interface QueryParams {
  age?: string;
  q?: string;
  sort?: string;
}

interface PapersListDispatchProps {
  toggleCategoryModal: () => void;
  setSelectedCategories: (categories: string[]) => void;
  fetchPapers: (...args: Parameters<typeof fetchPapers>) => void;
  clearPapers: () => void;
}
interface PapersListProps extends PapersListDispatchProps {
  match: RouteComponentProps<QueryParam>['match'];
  location: RouteComponentProps['location'];
  history: RouteComponentProps['history'];
  papers: PaperListItem[];
  totalPapers: number;
  groups: Group[];
}

const ALL_LISTS = 'All lists';

const PapersList: React.FC<PapersListProps> = ({
  match,
  location,
  history,
  toggleCategoryModal,
  setSelectedCategories,
  fetchPapers,
  clearPapers,
  papers,
  totalPapers,
  groups,
}) => {
  const isFirstLoad = React.useRef(true);
  const [scrollId, setScrollId] = React.useState(Math.random());
  const [hasMorePapers, setHasMorePapers] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const isLibrary = match && match.path === '/library';

  const getAgeQuery = (queryParams: QueryParams) => {
    return queryParams.age || (isLibrary || queryParams.q ? 'all' : 'week');
  };

  const getSortQuery = (queryParams: QueryParams) => {
    return queryParams.sort || (queryParams.q ? 'score' : 'tweets');
  };

  const loadPapers = (page: number) => {
    let url = '/papers/all';

    const queryParams = queryString.parse(location.search) as Partial<RequestParams>;
    const requestParams: Partial<RequestParams> = {
      author: match.params.authorId,
      page_num: page,
      age: getAgeQuery(queryParams),
      sort: getSortQuery(queryParams),
      q: (queryParams.q as string) || undefined,
      group: queryParams.group,
    };

    if (isLibrary) {
      url = '/library';
    }

    setIsLoading(true);
    fetchPapers({ url, requestParams, setHasMorePapers, finallyCb: () => setIsLoading(false) });
  };

  const handleFilters = (queryParam: string, queryValue: string | undefined) => {
    const newQ = {
      ...queryString.parse(location.search),
      [queryParam]: queryValue,
    };
    if (!queryValue) delete newQ[queryParam];
    history.push({
      pathname: location.pathname,
      search: queryString.stringify(newQ),
    });
  };
  const handleFiltersEvent = (event: React.ChangeEvent<{ name?: string; value: unknown }>, ignoreValue?: string) => {
    if (!event.target.name) return;
    let value: string | undefined = event.target.value as string;
    if (ignoreValue !== undefined && ignoreValue === value) {
      value = undefined;
    }
    if (value !== undefined) value = value.toLowerCase();
    handleFilters(event.target.name, value);
  };

  React.useEffect(() => {
    clearPapers();
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
    } else {
      setHasMorePapers(true);
      setIsLoading(false);
      setScrollId(Math.random());
    }
  }, [match.path, location.search, clearPapers]);

  React.useLayoutEffect(() => {
    const q = queryString.parse(location.search);
    const categories = q.categories as string;
    if (categories) setSelectedCategories(categories.split(';'));
  }, [location.search, setSelectedCategories]);

  const q = queryString.parse(location.search);
  const age = getAgeQuery(q);
  const sort = getSortQuery(q);

  return (
    <div
      css={css`
        ${presets.col};
        max-width: 992px;
        width: 100%;
        padding-top: 10px;
        margin: 10px 0px;
        ${presets.mqMax('lg')} {
          margin: 0px 15px;
        }
      `}
    >
      <div
        css={css`
          ${presets.row};
          align-items: center;
          justify-content: space-between;
        `}
      >
        <div
          css={css`
            display: flex;
            flex-grow: 1;
          `}
        >
          {!isLoading ? `${totalPapers} papers` : null}
        </div>
        <div css={filtersCss}>
          <FormControl css={formControlCss}>
            <Select
              value={age}
              onChange={e => handleFiltersEvent(e)}
              input={<Input name="age" id="filter-helper" />}
              css={filterValueCss}
            >
              <MenuItem css={filterMenuItemCss} value="day">
                Today
              </MenuItem>
              <MenuItem css={filterMenuItemCss} value="week">
                This week
              </MenuItem>
              <MenuItem css={filterMenuItemCss} value="month">
                This month
              </MenuItem>
              <MenuItem css={filterMenuItemCss} value="all">
                All times
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl css={formControlCss}>
            <Select
              value={sort}
              onChange={e => handleFiltersEvent(e)}
              input={<Input name="sort" id="sort-helper" />}
              css={filterValueCss}
            >
              <MenuItem css={filterMenuItemCss} value="date">
                Date
              </MenuItem>
              {/* <MenuItem value="comments">Comments</MenuItem> */}
              <MenuItem css={filterMenuItemCss} value="tweets">
                Tweets
              </MenuItem>
              <MenuItem css={filterMenuItemCss} value="bookmarks">
                Stars
              </MenuItem>
              {q && q.q && (
                <MenuItem css={filterMenuItemCss} value="score">
                  Relevance
                </MenuItem>
              )}
            </Select>
          </FormControl>
          {isLibrary ? (
            !isEmpty(groups) && (
              <FormControl css={formControlCss}>
                <Select
                  value={q.group || ALL_LISTS}
                  onChange={e => handleFiltersEvent(e, ALL_LISTS)}
                  input={<Input name="group" id="group-helper" />}
                  css={filterValueCss}
                >
                  <MenuItem css={filterMenuItemCss} value={ALL_LISTS}>
                    All lists
                  </MenuItem>
                  {groups.map(group => (
                    <MenuItem css={filterMenuItemCss} value={group.id} key={group.id}>
                      <div
                        css={css`
                          max-width: 200px;
                          overflow-x: hidden;
                          text-overflow: ellipsis;
                        `}
                      >
                        {group.name}
                      </div>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )
          ) : (
            <Chip
              size="small"
              variant="outlined"
              label="Categories"
              clickable={false}
              onClick={() => toggleCategoryModal()}
              css={css`
                font-size: 13px;
                height: 26px;
                &:hover {
                  background-color: rgba(0, 0, 0, 0.08);
                  cursor: pointer;
                }
              `}
            />
          )}
          <CategoriesModal onSelect={handleFilters} />
        </div>
      </div>
      <Grid container direction="column" key={scrollId}>
        <InfiniteScroll
          pageStart={0}
          loadMore={(page: number) => {
            loadPapers(page);
          }}
          hasMore={hasMorePapers && !isLoading}
          isLoading={isLoading}
          loader={
            <div key={0} css={papers.length === 0 ? spinnerEmptyStateCss : spinnerCss}>
              <CircularProgress />
            </div>
          }
          className={scrollWrapperCss}
        >
          {papers.map(p => (
            <PapersListItem key={p._id} paper={p} />
          ))}
        </InfiniteScroll>
      </Grid>
    </div>
  );
};

const mapStateToProps = (state: RootState) => {
  return {
    papers: state.papersList.papers,
    allCategories: state.papersList.allCategories,
    selectedCategories: state.papersList.selectedCategories,
    totalPapers: state.papersList.totalPapers,
    groups: state.user.groups,
  };
};

const mapDispatchToProps = (dispatch: RTDispatch): PapersListDispatchProps => ({
  toggleCategoryModal: () => {
    dispatch(actions.toggleCategoriesModal());
  },
  setSelectedCategories: categories => {
    dispatch(actions.setSelectedCategories(categories));
  },
  fetchPapers: payload => {
    dispatch(fetchPapers(payload));
  },
  clearPapers: () => {
    dispatch(actions.clearPapers());
  },
});

const withRedux = connect(
  mapStateToProps,
  mapDispatchToProps,
);

export default withRedux(withRouter(PapersList));
