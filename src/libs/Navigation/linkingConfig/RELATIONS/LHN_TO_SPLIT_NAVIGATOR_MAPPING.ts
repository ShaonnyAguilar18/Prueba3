// @TODO remove this file before merging to the main.
import NAVIGATORS from '@src/NAVIGATORS';
import SCREENS from '@src/SCREENS';

const LHN_TO_SPLIT_NAVIGATOR_NAME = {
    [SCREENS.SETTINGS.ROOT]: NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR,
    [SCREENS.HOME]: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR,
    [SCREENS.WORKSPACE.INITIAL]: NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR,
};

export default LHN_TO_SPLIT_NAVIGATOR_NAME;