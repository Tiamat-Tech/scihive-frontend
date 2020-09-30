/** @jsx jsx */
import { jsx } from '@emotion/core';
import {
  Button,
  Chip,
  CircularProgress,
  Fade,
  IconButton,
  Modal,
  TextField,
  Typography,
  Tooltip,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import GroupAddIcon from '@material-ui/icons/GroupAdd';
import Autocomplete from '@material-ui/lab/Autocomplete';
import Axios from 'axios';
import { isEmpty, pick, uniqBy } from 'lodash';
import React from 'react';
import { queryCache, useMutation, useQuery } from 'react-query';
import { toast } from 'react-toastify';
import shallow from 'zustand/shallow';
import { LoginWithGoogle } from '../auth/Google';
import { useHasContactsPermission } from '../auth/utils';
import baseStyle from '../base.module.scss';
import { usePaperStore } from '../stores/paper';
import { Spacer } from '../utils/Spacer';
import { CurrentCollaborators, GET_PERMISSIONS_Q } from './CurrentCollaborators';
import styles from './invite.module.css';

interface Suggestion {
  email: string;
  name: string;
}

const loadGoogleAPIClientAsync = async () => {
  return new Promise((resolve, reject) => {
    window.gapi.load('client', err => (err ? reject(err) : resolve()));
  });
};

const loadContactSuggestions = async (query: string): Promise<Suggestion[]> => {
  await loadGoogleAPIClientAsync();
  const {
    result: {
      feed: { entry },
    },
  } = await window.gapi.client.request({
    method: 'GET',
    path: '/m8/feeds/contacts/default/full',
    params: {
      alt: 'json',
      'max-results': 8,
      q: query,
    },
  });
  if (isEmpty(entry)) return [];

  const options = entry.map((t: any) => {
    const name = t.title && t.title['$t'];
    const email = t['gd$email'] && t['gd$email'][0] && t['gd$email'][0].address;
    if (name && email) {
      return { email, name };
    }
    return null;
  });

  return options.filter((option: Suggestion | null) => option !== null);
};

interface EmailsInputProps {
  selected: Suggestion[];
  setSelected: React.Dispatch<Suggestion[]>;
}

const EmailsInput: React.FC<EmailsInputProps> = React.memo(({ selected, setSelected }) => {
  const hasPermission = useHasContactsPermission();
  const [, setRefreshKey] = React.useState(0); // We need to refresh the view on login success
  const [inputValue, setInputValue] = React.useState('');
  const { data: options, isLoading } = useQuery(
    `LOAD_SUGGESTIONS_Q_${inputValue}`,
    () => {
      return loadContactSuggestions(inputValue);
    },
    { refetchOnWindowFocus: false, initialData: [], keepPreviousData: true },
  );

  return hasPermission ? (
    <Autocomplete
      multiple
      selectOnFocus
      handleHomeEndKeys
      freeSolo
      filterOptions={options => {
        // Remove selected from options
        const selectedEmails = new Set(selected.map(user => user.email));
        return options.filter(option => !selectedEmails.has(option.email));
      }}
      getOptionLabel={option => `${option.name} <${option.email}>`}
      options={[...selected, ...(options || [])]}
      value={selected}
      onChange={(_, newValues) => {
        const newSelected: Suggestion[] = newValues.map(value =>
          typeof value === 'string' ? { email: value, name: '' } : value,
        );
        // Ensure that we have unique emails
        setSelected(uniqBy(newSelected, 'email'));
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Tooltip key={option.email} title={option.email} placement="top" arrow>
            <Chip size="small" label={option.name || option.email} {...getTagProps({ index })} />
          </Tooltip>
        ))
      }
      renderInput={params => (
        <TextField
          {...params}
          label="Type name or email"
          variant="outlined"
          onChange={async e => {
            setInputValue(e.target.value);
          }}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <React.Fragment>
                {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </React.Fragment>
            ),
          }}
        />
      )}
    />
  ) : (
    <div css={{ display: 'flex', justifyContent: 'center' }}>
      <LoginWithGoogle
        onSuccess={() => {
          setRefreshKey(state => state + 1);
        }}
      />
    </div>
  );
});

export const Invite: React.FC = React.memo(() => {
  const { id: paperId, title, isInviteOpen, setIsInviteOpen, isEditable } = usePaperStore(
    state => pick(state, ['id', 'title', 'isInviteOpen', 'setIsInviteOpen', 'isEditable']),
    shallow,
  );
  const [newUsers, setNewUsers] = React.useState<Suggestion[]>([]);
  const [inviteText, setInviteText] = React.useState(`Check out this paper I'm reading - ${title}`);
  const [submitInvites, { isLoading, reset }] = useMutation(
    () => {
      return Axios.post(`/paper/${paperId}/invite`, { message: inviteText, users: newUsers });
    },
    {
      onSuccess: () => {
        toast.success('Invites Sent!', { autoClose: 5000 });
        queryCache.invalidateQueries(GET_PERMISSIONS_Q);
        setNewUsers([]);
      },
    },
  );

  return (
    <Modal
      disableBackdropClick
      open={isInviteOpen}
      onClose={() => {
        setIsInviteOpen(false);
      }}
    >
      <Fade in={isInviteOpen}>
        <div className={baseStyle.modal} style={{ width: 600 }}>
          <div className={styles.close}>
            <IconButton size="small" onClick={() => setIsInviteOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>
          <div className={baseStyle.centeredRow}>
            <GroupAddIcon color="primary" fontSize="large" />
            <Spacer size={12} />
            <Typography align="left" variant="h5">
              Invite collaborators to discuss this paper
            </Typography>
          </div>
          <Spacer size={20} />
          <EmailsInput selected={newUsers} setSelected={setNewUsers} />
          <Spacer size={16} />
          <TextField
            multiline
            fullWidth
            label="Add Message"
            variant="outlined"
            rows={3}
            value={inviteText}
            onChange={e => setInviteText(e.target.value)}
          />
          <Spacer size={12} />
          <Button
            disabled={isLoading}
            variant="contained"
            color="primary"
            onClick={async () => {
              reset();
              await submitInvites();
            }}
            css={{ alignSelf: 'center' }}
          >
            Invite
          </Button>

          {isEditable ? (
            <CurrentCollaborators />
          ) : (
            <React.Fragment>
              <Spacer size={16} />
              <Typography>
                <b>Warning:</b> This paper is public
              </Typography>
            </React.Fragment>
          )}
        </div>
      </Fade>
    </Modal>
  );
});
