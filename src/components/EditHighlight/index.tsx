/** @jsx jsx */
import { css, jsx } from '@emotion/core';
import { Button, TextField } from '@material-ui/core';
import React from 'react';
import { EditHighlightData, Visibility } from '../../models';
import { useUserStore } from '../../stores/user';
import { presets } from '../../utils';
import { VisibilityControl } from './VisibilityControl';

interface Props {
  onSubmit: (data: EditHighlightData) => void;
  text?: string;
  visibilitySettings: Visibility;
  isTextRequired?: boolean;
}

export const EditHighlight: React.FC<Props> = ({ onSubmit, text = '', visibilitySettings, isTextRequired = true }) => {
  const isLoggedIn = useUserStore(state => Boolean(state.userData));
  const firstFocus = React.useRef(true);
  const [internalText, setInternalText] = React.useState(text);
  const [internalVisibility, setInternalVisibilty] = React.useState(visibilitySettings);

  React.useEffect(() => {
    setInternalVisibilty(visibilitySettings);
  }, [visibilitySettings]);

  React.useEffect(() => {
    setInternalText(text);
  }, [text]);

  return (
    <form
      css={css`
        padding: 0px 10px 10px;
        background: #fff;
        background-clip: padding-box;
        border: 1px solid #e8e8e8;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(37, 40, 43, 0.2);
        width: 290px;
        input[type='submit'] {
          margin-top: 5px;
          font-size: large;
        }
      `}
      onSubmit={event => {
        event.preventDefault();
        onSubmit({ text: internalText, visibility: internalVisibility });
      }}
    >
      <div>
        <TextField
          type="text"
          name="comment"
          label="Your Comment"
          placeholder="Add a comment (Optional)"
          multiline
          margin="dense"
          variant="outlined"
          value={internalText}
          fullWidth
          required={isTextRequired}
          onChange={event => setInternalText(event.target.value)}
          inputRef={inp => {
            if (inp && firstFocus.current) {
              firstFocus.current = false;
              setTimeout(() => inp.focus(), 100);
            }
          }}
          css={{ textarea: { minHeight: 70, padding: '4px 10px' }, '.MuiInputBase-marginDense': { paddingTop: 6 } }}
        />
      </div>
      <div
        css={css`
          ${presets.row};
          font-size: 0.65rem;
          color: grey;
          margin-bottom: 8px;
        `}
      >
        * Type LaTeX formulas using $ signs, e.g. $(3\times 4)$
      </div>
      <div css={{ marginTop: 10 }}>
        {isLoggedIn ? (
          <VisibilityControl visibilitySettings={internalVisibility} setCommentVisibilty={setInternalVisibilty} />
        ) : (
          <div
            css={css`
              font-size: 12px;
              color: #9f9f9f;
            `}
          >
            Please log in to add private and list comments
          </div>
        )}
      </div>
      <div
        css={[
          presets.row,
          {
            width: '100%',
            justifyContent: 'flex-end',
            marginTop: 15,
          },
        ]}
      >
        <Button type="submit" variant="contained" color="primary" size="small">
          Submit
        </Button>
      </div>
    </form>
  );
};
