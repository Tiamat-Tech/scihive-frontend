import { createMuiTheme, MuiThemeProvider } from '@material-ui/core/styles';
import axios from 'axios';
import { isEmpty } from 'lodash';
import React, { useEffect } from 'react';
import { connect } from 'react-redux';
import { Route, Switch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import LoginSignupModal from './components/LoginSignupModal';
import { RootState } from './models';
import About from './pages/About';
import Admin from './pages/Admin';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Paper from './pages/Paper';
import chromeExtensionPopup from './utils/chromeExtension';
import { themePalette } from './utils/presets';

const theme = createMuiTheme({
  palette: themePalette,
  typography: {
    fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
  },
});

const App: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => {
  useEffect(() => {
    if (isLoggedIn) {
      axios
        .get('/user/validate')
        .then(() => {})
        .catch(err => {
          if (err.response && err.response.status) {
            localStorage.removeItem('username');
            window.location.reload();
          }
        });
    }
    chromeExtensionPopup();
  }, []);

  return (
    <React.Fragment>
      <MuiThemeProvider theme={theme}>
        <LoginSignupModal />
        <Switch>
          <Route path="/library" exact component={Home} />
          <Route path="/" exact component={Home} />
          <Route path="/search/" exact component={Home} />
          <Route path="/author/:authorId" exact component={Home} />
          <Route path="/paper/:PaperId" exact component={Paper} />
          <Route path="/about" exact component={About} />
          <Route path="/admin" exact component={Admin} />
          <Route component={NotFound} />
        </Switch>
        <ToastContainer
          position="bottom-center"
          autoClose={false}
          newestOnTop={false}
          closeOnClick={false}
          rtl={false}
          draggable
        />
      </MuiThemeProvider>
    </React.Fragment>
  );
};

const mapStateToProps = (state: RootState) => {
  return {
    isLoggedIn: !isEmpty(state.user.userData),
  };
};

const withRedux = connect(mapStateToProps);

export default withRedux(App);
