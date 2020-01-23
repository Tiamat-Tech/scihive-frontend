/** @jsx jsx */
import { css, jsx } from '@emotion/core';
import Fab from '@material-ui/core/Fab';
import { cloneDeep, debounce, isEmpty, pick } from 'lodash';
import { PDFDocumentProxy } from 'pdfjs-dist';
// @ts-ignore
import { PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer';
import 'pdfjs-dist/web/pdf_viewer.css';
import React from 'react';
import ReactDom from 'react-dom';
import shallow from 'zustand/shallow';
import {
  AcronymPositions,
  T_LTWH,
  T_NewHighlight,
  T_Position,
  T_ScaledPosition,
  isDirectHighlight,
  T_Highlight,
} from '../../../models';
import { usePaperStore } from '../../../stores/paper';
import { useLatestCallback } from '../../../utils/useLatestCallback';
import { APP_BAR_HEIGHT } from '../../TopBar/PrimaryAppBar';
import { scaledToViewport, viewportToScaled } from '../lib/coordinates';
import getAreaAsPng from '../lib/get-area-as-png';
import getBoundingRect from '../lib/get-bounding-rect';
import getClientRects from '../lib/get-client-rects';
import { findOrCreateContainerLayer, getPageFromElement, getPageFromRange } from '../lib/pdfjs-dom';
import { convertMatches, renderMatches } from '../lib/pdfSearchUtils';
import '../style/PdfHighlighter.css';
import MouseSelection from './MouseSelection';
import { PageHighlights } from './PageHighlights';
import { TipContainer } from './TipContainer';
import { useJumpToHandler } from './useJumpToHandler';

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

const pdfViewerCss = css`
  .textLayer ::selection {
    background: rgb(255, 172, 0);
    opacity: 1;
    mix-blend-mode: multiply;
  }
  .page-highlights {
    z-index: 2;
    opacity: 1;
    mix-blend-mode: multiply;
  }

  .annotationLayer {
    position: absolute;
    top: 0;
    z-index: 3;
  }

  /* Microsoft Edge Browser 12+ (All) - @supports method */
  @supports (-ms-ime-align: auto) {
    .page-highlights {
      opacity: 0.5;
    }
  }

  .page {
    box-shadow: 0 0 0 0.75pt #d1d1d1, 0 0 3pt 0.75pt #ccc;
  }
`;

interface PdfAnnotatorProps {
  enableAreaSelection: (event: MouseEvent) => boolean;
  onReferenceEnter: (event: React.MouseEvent) => void;
  pdfDocument: PDFDocumentProxy;
}

const PdfAnnotator: React.FC<PdfAnnotatorProps> = ({ enableAreaSelection, onReferenceEnter, pdfDocument }) => {
  // const [scrolledToHighlightId, setScrolledToHighlightId] = React.useState(EMPTY_ID);
  const [isAreaSelectionInProgress, setIsAreaSelectionInProgress] = React.useState(false);
  const [isDocumentReady, setIsDocumentReady] = React.useState(false);
  const pagesReadyToRender = React.useRef<number[]>([]);
  const [acronymPositions, setAcronymPositions] = React.useState<AcronymPositions>({});
  const canZoom = React.useRef(true);

  const {
    paperJumpData,
    highlights,
    jumpToComment,
    updateReadingProgress,
    acronyms,
    clearTempHighlightAndTooltip,
    tempHighlight,
    setTooltipData,
    setTempHighlight,
    tempTooltipData,
  } = usePaperStore(
    state => ({
      ...pick(state, [
        'clearPaperJumpTo',
        'paperJumpData',
        'highlights',
        'updateReadingProgress',
        'setTooltipData',
        'acronyms',
        'setTempHighlight',
        'tempHighlight',
        'clearTempHighlightAndTooltip',
        'tempTooltipData',
      ]),
      jumpToComment: (id: string) => {
        state.setSidebarTab('Comments');
        state.setSidebarJumpTo({ area: 'sidebar', type: 'comment', id });
      },
    }),
    shallow,
  );

  const viewer = React.useRef<PDFViewer>(null);
  const linkService = React.useRef<PDFLinkService>(null);
  const containerNode = React.useRef<HTMLDivElement>(null);
  const highlightLayerNode = React.useRef<HTMLDivElement>(null);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      clearTempHighlightAndTooltip();
    }
  };

  const onDocumentReady = () => {
    if (!containerNode.current) {
      console.error('Container node is not initialized');
      return;
    }
    const { viewport } = viewer.current.getPageView(0);
    viewer.current.currentScaleValue = containerNode.current.clientWidth / viewport.width - 0.05;
    setIsDocumentReady(true);
  };

  const screenshot = (position: T_LTWH, pageNumber: number) => {
    const { canvas } = viewer.current.getPageView(pageNumber - 1);
    return getAreaAsPng(canvas, position);
  };

  const debouncedOnTextSelection = debounce(newRange => {
    const page = getPageFromRange(newRange);
    if (!page) return;
    const rects = getClientRects(newRange, page.node);
    if (rects.length === 0) return;

    const boundingRect = getBoundingRect(rects);

    const viewportPosition = { boundingRect, rects, pageNumber: page.number };

    const content: T_NewHighlight['content'] = {
      text: newRange.toString(),
    };
    renderTipAtPosition(viewportPosition, content);
  }, 30);

  const onTextSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const curRange = selection.getRangeAt(0);
    if (!curRange) return;
    debouncedOnTextSelection(curRange);
  };

  const viewportPositionToScaled = ({ pageNumber, boundingRect, rects }: T_Position) => {
    const { viewport } = viewer.current.getPageView(pageNumber - 1);

    return {
      boundingRect: viewportToScaled(boundingRect, viewport),
      rects: (rects || []).map(rect => viewportToScaled(rect, viewport)),
      pageNumber,
    };
  };

  const renderTipAtPosition = (position: T_Position, content: T_NewHighlight['content']) => {
    const { boundingRect, pageNumber } = position;
    const page = { node: viewer.current.getPageView(pageNumber - 1).div };
    const scaledPosition = viewportPositionToScaled(position);

    const size = {
      left: page.node.offsetLeft + boundingRect.left + boundingRect.width / 2,
      top: boundingRect.top + page.node.offsetTop,
      bottom: boundingRect.top + page.node.offsetTop + boundingRect.height,
    };
    setTooltipData({ position: scaledPosition, content, size });
  };

  const onAreaSelection = (startTarget: HTMLElement, boundingRect: T_LTWH) => {
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

    const image = screenshot(pageBoundingRect, page.number);
    renderTipAtPosition(viewportPosition, { image });
  };

  const scaledPositionToViewport = ({ pageNumber, boundingRect, rects, usePdfCoordinates }: T_ScaledPosition) => {
    const { viewport } = viewer.current.getPageView(pageNumber - 1);

    return {
      boundingRect: scaledToViewport(boundingRect, viewport, usePdfCoordinates),
      rects: (rects || []).map(rect => scaledToViewport(rect, viewport, usePdfCoordinates)),
      pageNumber,
    };
  };

  const findOrCreateHighlightLayer = (page: number) => {
    const { annotationLayer } = viewer.current.getPageView(page - 1);
    if (!annotationLayer) return null;
    return findOrCreateContainerLayer(annotationLayer.pageDiv, 'page-highlights');
  };

  const renderHighlights = (pageNumber: number) => {
    const existingPageHighlights: T_Highlight[] = [];
    for (const h of highlights) {
      if (isDirectHighlight(h) && h.position.pageNumber === pageNumber) existingPageHighlights.push(h);
    }
    const pageHighlights =
      tempHighlight && tempHighlight.position.pageNumber === pageNumber
        ? [...existingPageHighlights, tempHighlight]
        : existingPageHighlights;

    if (!pdfDocument) return;
    const highlightLayer = findOrCreateHighlightLayer(pageNumber);
    if (highlightLayer) {
      ReactDom.render(
        <PageHighlights
          onHighlightClick={jumpToComment}
          highlights={pageHighlights}
          screenshot={(boundingRect: T_LTWH) => screenshot(boundingRect, pageNumber)}
          scaledPositionToViewport={scaledPositionToViewport}
          jumpData={paperJumpData}
        />,
        highlightLayer,
      );
    }
  };
  useJumpToHandler({ viewer, renderHighlights });

  const renderAcronyms = (pageNumber: number) => {
    const { textLayer } = viewer.current.getPageView(pageNumber - 1);
    for (const acronym of Object.keys(acronymPositions)) {
      const m = convertMatches(acronym.length, acronymPositions[acronym][pageNumber - 1], textLayer);
      renderMatches(m, 0, textLayer, acronyms[acronym]);
    }
  };

  const onTextLayerRendered = useLatestCallback(
    (event: CustomEvent<{ pageNumber: number }>) => {
      // TODO: clear previous timeout and remove timeout on unmount
      setTimeout(() => {
        // This hack helps us ensure the the user doesn't zoom in/out too fast
        canZoom.current = true;
      }, 200);
      const { pageNumber } = event.detail;
      renderHighlights(pageNumber);
      renderAcronyms(pageNumber);
      pagesReadyToRender.current.push(pageNumber);
    },
    [acronymPositions, highlights, tempHighlight],
  );

  const onMouseDown = (event: React.MouseEvent) => {
    clearTempHighlightAndTooltip();
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (tempTooltipData) setTempHighlight({ position: tempTooltipData.position, content: tempTooltipData.content });
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
    if (canZoom.current) {
      viewer.current.currentScaleValue = parseFloat(viewer.current.currentScaleValue) + sign * 0.05;
    }
    canZoom.current = false;
  };

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
  }, [pdfDocument]);

  React.useEffect(() => {
    document.addEventListener('pagesinit', onDocumentReady);
    document.addEventListener('textlayerrendered', onTextLayerRendered as EventListener);
    document.addEventListener('selectionchange', onTextSelectionChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pagesinit', onDocumentReady);
      document.removeEventListener('textlayerrendered', onTextLayerRendered as EventListener);
      document.removeEventListener('selectionchange', onTextSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  React.useEffect(() => {
    if (!isDocumentReady) return;
    for (const pageNumber of pagesReadyToRender.current) {
      renderHighlights(pageNumber);
    }
  }, [isDocumentReady, tempHighlight, highlights]);

  React.useEffect(() => {
    if (!isDocumentReady) return;
    for (const pageNumber of pagesReadyToRender.current) {
      renderAcronyms(pageNumber);
    }
  }, [isDocumentReady, acronymPositions]);

  React.useEffect(() => {
    // Find acronyms in the pdf
    if (!pdfDocument || !isDocumentReady || isEmpty(acronyms)) return;
    const { findController } = viewer.current;
    // We are accessing private functions of findController. Not ideal...
    findController._firstPageCapability.promise.then(async () => {
      findController._extractText();
      const tempAcronymsPos: AcronymPositions = {};
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
  }, [isDocumentReady, acronyms, pdfDocument]);

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
        onMouseUp={onMouseUp}
        className="PdfHighlighter"
        onScroll={onViewerScroll}
        onContextMenu={e => e.preventDefault()}
        style={{ height: `calc(100vh - ${APP_BAR_HEIGHT}px)` }}
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
          }
        }}
        css={pdfViewerCss}
      >
        <div className="pdfViewer" />
        <TipContainer />
        <div ref={highlightLayerNode} />
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
            onSelection={onAreaSelection}
          />
        ) : null}
      </div>
    </React.Fragment>
  );
};

export default PdfAnnotator;
