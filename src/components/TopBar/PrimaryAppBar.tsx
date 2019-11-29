/** @jsx jsx */
import { jsx } from '@emotion/core';
import AppBar from '@material-ui/core/AppBar/index';
import { Theme, withStyles } from '@material-ui/core/styles/index';
import Toolbar from '@material-ui/core/Toolbar/index';
import React from 'react';
import Headroom from 'react-headroom';
import { Link } from 'react-router-dom';
import { DesktopMenu, MobileMenu } from './BaseRightMenu';
import { ReactComponent as Logo } from './logoWithText.svg';
import SearchBar from './SearchBar';

const styles = (theme: Theme) => ({
  root: {
    width: '100%',
  },
  gutters: {
    [theme.breakpoints.down('sm')]: {
      paddingRight: '4px',
    },
  },
  grow: {
    flexGrow: 1,
  },
  title: {
    display: 'none',
    [theme.breakpoints.up('sm')]: {
      display: 'block',
    },
  },
  sectionDesktop: {
    display: 'none',
    [theme.breakpoints.up('md')]: {
      display: 'flex',
      alignItems: 'center',
    },
  },
  sectionMobile: {
    display: 'flex',
    [theme.breakpoints.up('md')]: {
      display: 'none',
    },
  },
});

interface Props {
  classes: { [key: string]: string };
  desktopItems?: React.ReactElement;
  mobileRootItems?: React.ReactElement;
  mobileSubItems?: React.ReactElement;
}

const PrimaryAppBar: React.FC<Props> = ({ classes, desktopItems, mobileRootItems, mobileSubItems }) => {
  return (
    <Headroom>
      <AppBar position="relative" style={{ backgroundColor: '#36a0f5', color: '#ffffff' }}>
        <Toolbar classes={{ gutters: classes.gutters }} variant="dense">
          <div css={{ display: 'flex', flexGrow: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Link to="/" style={{ display: 'flex' }}>
              <Logo height={26} />
            </Link>
            <SearchBar />
          </div>
          <div className={classes.sectionDesktop}>
            <DesktopMenu>{desktopItems}</DesktopMenu>
          </div>
          <div className={classes.sectionMobile}>
            <MobileMenu rootChildren={mobileRootItems} submenuChildren={mobileSubItems} />
          </div>
        </Toolbar>
      </AppBar>
    </Headroom>
  );
};

const stylesWrapper = withStyles(styles);
export default stylesWrapper(PrimaryAppBar);

export const APP_BAR_HEIGHT = 48;
