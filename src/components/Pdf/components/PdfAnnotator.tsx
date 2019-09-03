/** @jsx jsx */
import { css, jsx } from '@emotion/core';

import React from 'react';
import ReactDom from 'react-dom';
// @ts-ignore
import { PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer';
import 'pdfjs-dist/web/pdf_viewer.css';
import Fab from '@material-ui/core/Fab';
import { connect, Provider } from 'react-redux';
import { cloneDeep, debounce, isEmpty } from 'lodash';
import getBoundingRect from '../lib/get-bounding-rect';
import getClientRects from '../lib/get-client-rects';
import getAreaAsPng from '../lib/get-area-as-png';

import '../style/pdf_viewer.css';
import '../style/PdfHighlighter.css';

import { findOrCreateContainerLayer, getPageFromElement, getPageFromRange } from '../lib/pdfjs-dom';

import TipContainer from './TipContainer';
import MouseSelection from './MouseSelection';

import { scaledToViewport, viewportToScaled } from '../lib/coordinates';

import { store } from '../../../store';
import { APP_BAR_HEIGHT } from '../../TopBar/PrimaryAppBar';
import { actions } from '../../../actions';
import { convertMatches, renderMatches } from '../lib/pdfSearchUtils';
import { Dispatch } from 'redux';
import { Acronyms, T_Highlight, T_LTWH } from '../../../models';

interface TipObject {
  highlight: T_Highlight;
  callback: (h: T_Highlight) => void;
}

const zoomButtonCss = css`
  color: black;
  font-size: 1rem;
  margin-bottom: 8px;
`;

const ZoomButtom = ({ direction, onClick }: any) => (
  <div>
    <Fab
      color="default"
      aria-label={direction === 'in' ? 'zoom-in' : 'zoom-out'}
      onClick={onClick}
      size="small"
      css={zoomButtonCss}
    >
      <i className={`fas fa-search-${direction === 'in' ? 'plus' : 'minus'}`} />
    </Fab>
  </div>
);

const PdfAnnotator = ({
  pdfDocument,
  isVertical,
  enableAreaSelection,
  onReferenceEnter,
  onReferenceLeave,
  highlightTransform,
  highlights,
  acronyms,
  onSelectionFinished,
  updateReadingProgress,
  clearJumpTo,
  jumpData,
}: any) => {
  const [ghostHighlight, setGhostHighlight] = React.useState<object>();
  const [isCollapsed, setIsCollapsed] = React.useState(true);
  const [range, setRange] = React.useState<Range>();
  const [tip, setTip] = React.useState<TipObject>();
  // const [scrolledToHighlightId, setScrolledToHighlightId] = React.useState(EMPTY_ID);
  const [isAreaSelectionInProgress, setIsAreaSelectionInProgress] = React.useState(false);
  const [isDocumentReady, setIsDocumentReady] = React.useState(false);
  const [requestRender, setRequestRender] = React.useState(false);
  const pagesToRenderAcronyms = React.useRef<any[]>([]);
  const [firstPageRendered, setFirstPageRendered] = React.useState(false);
  const [acronymPositions, setAcronymPositions] = React.useState<Acronyms>({});

  const viewer = React.useRef<PDFViewer>(null);
  const linkService = React.useRef<PDFLinkService>(null);
  const containerNode = React.useRef<HTMLDivElement>(null);

  const hideTipAndSelection = () => {
    const tipNode = findOrCreateContainerLayer(viewer.current.viewer, 'PdfHighlighter__tip-layer');
    ReactDom.unmountComponentAtNode(tipNode);
    setGhostHighlight(undefined);
    setTip(undefined);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      hideTipAndSelection();
    }
  };

  const onScroll = () => {
    // TODO: clean hash
    // window.location.hash = '';
    clearJumpTo();
    viewer.current.container.removeEventListener('scroll', onScroll);
  };

  const scrollToHighLight = () => {
    const { pageNumber, boundingRect, usePdfCoordinates } = jumpData.location;
    const pageViewport = viewer.current.getPageView(pageNumber - 1).viewport;

    const scrollMargin = 10;

    viewer.current.scrollPageIntoView({
      pageNumber,
      destArray: [
        null,
        { name: 'XYZ' },
        ...pageViewport.convertToPdfPoint(
          0,
          scaledToViewport(boundingRect, pageViewport, usePdfCoordinates).top - scrollMargin,
        ),
        0,
      ],
    });
  };

  const onJumpToChange = () => {
    if (isEmpty(jumpData) || jumpData.area !== 'paper') return;
    viewer.current.container.removeEventListener('scroll', onScroll);
    if (!jumpData.location) return;
    if (jumpData.type === 'highlight') {
      scrollToHighLight();
    } else {
      if (!jumpData.location || !jumpData.location.pageNumber || !jumpData.location.position)
        throw Error('Position is missing');
      const { pageNumber, position } = jumpData.location;

      viewer.current.scrollPageIntoView({
        pageNumber,
        destArray: [null, { name: 'XYZ' }, 0, position],
      });
    }

    // wait for scrolling to finish
    setTimeout(() => {
      viewer.current.container.addEventListener('scroll', onScroll);
    }, 100);
  };

  const onDocumentReady = () => {
    if (!containerNode.current) {
      console.error('Container node is not initialized');
      return;
    }
    const { viewport } = viewer.current.getPageView(0);
    viewer.current.currentScaleValue = containerNode.current.clientWidth / viewport.width - 0.05;
    setIsDocumentReady(true);
    onJumpToChange();
  };

  const screenshot = (position: any, pageNumber: number) => {
    const { canvas } = viewer.current.getPageView(pageNumber - 1);
    return getAreaAsPng(canvas, position);
  };

  const debouncedUpdateSelection = debounce(newRange => {
    setIsCollapsed(false);
    setRange(newRange);
  }, 50);

  const onSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setIsCollapsed(true);
      return;
    }
    const curRange = selection.getRangeAt(0);
    if (!curRange) return;
    debouncedUpdateSelection(curRange);
  };

  const viewportPositionToScaled = ({ pageNumber, boundingRect, rects }: any) => {
    const { viewport } = viewer.current.getPageView(pageNumber - 1);

    return {
      boundingRect: viewportToScaled(boundingRect, viewport),
      rects: (rects || []).map((rect: any) => viewportToScaled(rect, viewport)),
      pageNumber,
    };
  };

  const renderTipAtPosition = (position: any, inner: any) => {
    const { boundingRect, pageNumber } = position;
    const page = { node: viewer.current.getPageView(pageNumber - 1).div };
    const pageBoundingRect = page.node.getBoundingClientRect();
    const tipNode = findOrCreateContainerLayer(viewer.current.viewer, 'PdfHighlighter__tip-layer');

    ReactDom.render(
      <Provider store={store}>
        <TipContainer
          scrollTop={viewer.current.container.scrollTop}
          pageBoundingRect={pageBoundingRect}
          style={{
            left: page.node.offsetLeft + boundingRect.left + boundingRect.width / 2,
            top: boundingRect.top + page.node.offsetTop,
            bottom: boundingRect.top + page.node.offsetTop + boundingRect.height,
          }}
          children={inner}
        />
      </Provider>,
      tipNode,
    );
  };

  const onSelection = (startTarget: any, boundingRect: T_LTWH) => {
    const page = getPageFromElement(startTarget);

    if (!page) return;

    const pageBoundingRect = {
      ...boundingRect,
      top: boundingRect.top - page.node.offsetTop,
      left: boundingRect.left - page.node.offsetLeft,
    };

    const viewportPosition = {
      boundingRect: pageBoundingRect,
      rects: [],
      pageNumber: page.number,
    };

    const scaledPosition = viewportPositionToScaled(viewportPosition);

    const image = screenshot(pageBoundingRect, page.number);

    renderTipAtPosition(
      viewportPosition,
      onSelectionFinished(
        scaledPosition,
        { image },
        () => hideTipAndSelection(),
        () => {
          setGhostHighlight({
            position: scaledPosition,
            content: { image },
          });
        },
      ),
    );
  };

  const groupHighlightsByPage = () => {
    return [...highlights, ghostHighlight].filter(Boolean).reduce((res, highlight) => {
      const { pageNumber } = highlight.position;

      res[pageNumber] = res[pageNumber] || [];
      res[pageNumber].push(highlight);

      return res;
    }, {});
  };

  const scaledPositionToViewport = ({ pageNumber, boundingRect, rects, usePdfCoordinates }: any) => {
    const { viewport } = viewer.current.getPageView(pageNumber - 1);

    return {
      boundingRect: scaledToViewport(boundingRect, viewport, usePdfCoordinates),
      rects: (rects || []).map((rect: any) => scaledToViewport(rect, viewport, usePdfCoordinates)),
      pageNumber,
    };
  };

  const findOrCreateHighlightLayer = (page: number) => {
    const { textLayer } = viewer.current.getPageView(page - 1);
    if (!textLayer) return null;
    return findOrCreateContainerLayer(textLayer.textLayerDiv, 'PdfHighlighter__highlight-layer');
  };

  const showTip = (highlight: any, content: any) => {
    const highlightInProgress = !isCollapsed || ghostHighlight;
    if (highlightInProgress || isAreaSelectionInProgress) {
      return;
    }
    renderTipAtPosition(highlight.position, content);
  };

  const renderHighlights = () => {
    const highlightsByPage = groupHighlightsByPage();
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const highlightLayer = findOrCreateHighlightLayer(pageNumber);
      if (highlightLayer) {
        ReactDom.render(
          <div>
            {(highlightsByPage[pageNumber] || []).map((highlight: any, index: number) => {
              const { position, ...rest } = highlight;

              const viewportHighlight = {
                position: scaledPositionToViewport(position),
                ...rest,
              };

              if (tip && tip.highlight && tip.highlight.id === String(highlight.id)) {
                showTip(tip.highlight, tip.callback(viewportHighlight));
              }

              const isScrolledTo = jumpData && jumpData.type === 'highlight' && jumpData.id === highlight.id;

              return highlightTransform(
                viewportHighlight,
                index,
                (curHighlight: T_Highlight, callback: (h: T_Highlight) => void) => {
                  setTip({ highlight: curHighlight, callback });
                  showTip(curHighlight, callback(curHighlight));
                },
                hideTipAndSelection,
                (rect: T_LTWH) => {
                  const { viewport } = viewer.current.getPageView(pageNumber - 1);

                  return viewportToScaled(rect, viewport);
                },
                (boundingRect: T_LTWH) => screenshot(boundingRect, pageNumber),
                isScrolledTo,
              );
            })}
          </div>,
          highlightLayer,
        );
      }
    }
  };

  const onTextLayerRendered = (event: any) => {
    pagesToRenderAcronyms.current.push(event.detail.pageNumber - 1);
    setRequestRender(true);
    setFirstPageRendered(true);
  };

  const containerStyle = isVertical
    ? { height: '100%', width: '100vw' }
    : { height: `calc(100vh - ${APP_BAR_HEIGHT}px)` };

  const onMouseDown = (event: React.MouseEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.PdfHighlighter__tip-container')) return;
    hideTipAndSelection();
  };

  const toggleTextSelection = (flag: boolean) => {
    viewer.current.viewer.classList.toggle('PdfHighlighter--disable-selection', flag);
  };

  const onViewerScroll = () => {
    const { viewer: viewerInner, container } = viewer.current;
    const maxYpos = Math.max(0, viewerInner.clientHeight - container.clientHeight);
    const progress = Math.min(1, container.scrollTop / maxYpos) * 100;
    updateReadingProgress(progress);
  };

  const zoom = (sign: number) => {
    viewer.current.currentScaleValue = parseFloat(viewer.current.currentScaleValue) + sign * 0.05;
  };

  React.useEffect(() => {
    // after selection
    if (!range || isCollapsed) return;
    const page = getPageFromRange(range);
    if (!page) return;
    const rects = getClientRects(range, page.node);
    if (rects.length === 0) return;

    const boundingRect = getBoundingRect(rects);

    const viewportPosition = { boundingRect, rects, pageNumber: page.number };

    const content = {
      text: range.toString(),
    };
    const scaledPosition = viewportPositionToScaled(viewportPosition);
    renderTipAtPosition(
      viewportPosition,
      onSelectionFinished(
        scaledPosition,
        content,
        () => hideTipAndSelection(),
        () => setGhostHighlight({ position: scaledPosition }),
      ),
    );
  }, [isCollapsed, range]);

  React.useEffect(() => {
    linkService.current = new PDFLinkService();

    const pdfFindController = new PDFFindController({
      linkService: linkService.current,
    });

    viewer.current = new PDFViewer({
      container: containerNode.current,
      enhanceTextSelection: true,
      removePageBorders: true,
      linkService: linkService.current,
      findController: pdfFindController,
    });

    viewer.current.setDocument(pdfDocument);
    linkService.current.setDocument(pdfDocument);
    linkService.current.setViewer(viewer.current);

    if (containerNode.current) {
      containerNode.current.addEventListener('pagesinit', onDocumentReady);
      containerNode.current.addEventListener('textlayerrendered', onTextLayerRendered);
    }
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (containerNode.current) {
        containerNode.current.removeEventListener('pagesinit', onDocumentReady);
        containerNode.current.removeEventListener('textlayerrendered', onTextLayerRendered);
      }
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  React.useEffect(() => {
    // Find acronyms in the pdf
    if (!isDocumentReady || isEmpty(acronyms)) return;
    const { findController } = viewer.current;
    // We are accessing private functions of findController. Not ideal...
    findController._firstPageCapability.promise.then(async () => {
      findController._extractText();
      const tempAcronymsPos: Acronyms = {};
      for (const acronym of Object.keys(acronyms)) {
        findController._state = {
          query: acronym,
          caseSensitive: true,
          highlightAll: false,
          entireWord: true,
        };
        for (let i = 0; i < pdfDocument.numPages; i++) {
          findController._pendingFindMatches[i] = true;
          findController._extractTextPromises[i].then((pageIdx: number) => {
            delete findController._pendingFindMatches[pageIdx];
            findController._calculateMatch(pageIdx);
          });
        }
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(findController._extractTextPromises);
        tempAcronymsPos[acronym] = cloneDeep(findController.pageMatches);
      }
      setAcronymPositions(tempAcronymsPos);
    });
  }, [isDocumentReady, acronyms]);

  React.useEffect(() => {
    if (!isDocumentReady || isEmpty(pagesToRenderAcronyms.current) || isEmpty(acronymPositions) || !requestRender)
      return;
    for (const pageIdx of pagesToRenderAcronyms.current) {
      const { textLayer } = viewer.current.getPageView(pageIdx);
      for (const acronym of Object.keys(acronymPositions)) {
        const m = convertMatches(acronym.length, acronymPositions[acronym][pageIdx], textLayer);
        renderMatches(m, 0, textLayer, acronyms[acronym]);
      }
    }
    setRequestRender(false);
    pagesToRenderAcronyms.current = [];
  }, [isDocumentReady, requestRender, acronymPositions]);

  React.useEffect(() => {
    onJumpToChange();
  }, [jumpData]);

  React.useEffect(() => {
    if (!isDocumentReady || !firstPageRendered) return;
    renderHighlights();
  }, [isDocumentReady, firstPageRendered, ghostHighlight, isCollapsed, jumpData, highlights]);

  return (
    <React.Fragment>
      <div
        css={css`
          position: absolute;
          bottom: 10px;
          right: 8px;
          z-index: 1000;
        `}
      >
        <ZoomButtom direction="in" onClick={() => zoom(1)} />
        <ZoomButtom direction="out" onClick={() => zoom(-1)} />
      </div>
      <div
        ref={containerNode}
        onMouseDown={onMouseDown}
        className="PdfHighlighter"
        onScroll={onViewerScroll}
        onContextMenu={e => e.preventDefault()}
        style={containerStyle}
        onClick={e => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A' && (target.getAttribute('href') || '').includes('#cite')) {
            onReferenceEnter(e);
          }
        }}
        onMouseOver={e => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A' && (target.getAttribute('href') || '').includes('#cite')) {
            onReferenceEnter(e);
          } else if (onReferenceLeave) {
            onReferenceLeave();
          }
        }}
      >
        <div className="pdfViewer" />
        {typeof enableAreaSelection === 'function' ? (
          <MouseSelection
            onDragStart={() => toggleTextSelection(true)}
            onDragEnd={() => toggleTextSelection(false)}
            onChange={isVisible => {
              if (isVisible !== isAreaSelectionInProgress) {
                setIsAreaSelectionInProgress(isVisible);
              }
            }}
            shouldStart={event =>
              enableAreaSelection(event) &&
              event.target instanceof HTMLElement &&
              Boolean(event.target.closest('.page'))
            }
            onSelection={onSelection}
          />
        ) : null}
      </div>
    </React.Fragment>
  );
};

const mapStateToProps = (state: any) => {
  return {
    highlights: state.paper.highlights,
    acronyms: state.paper.acronyms,
    jumpData: state.paper.jumpData,
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => {
  return {
    updateReadingProgress: (pos: number) => {
      dispatch(actions.updateReadingProgress(pos));
    },
    clearJumpTo: () => {
      dispatch(actions.clearJumpTo());
    },
  };
};
const withRedux = connect(
  mapStateToProps,
  mapDispatchToProps,
);

export default withRedux(PdfAnnotator);
