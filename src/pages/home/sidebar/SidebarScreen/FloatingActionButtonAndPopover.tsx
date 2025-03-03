import {useIsFocused as useIsFocusedOriginal, useNavigationState} from '@react-navigation/native';
import type {ImageContentFit} from 'expo-image';
import type {ForwardedRef} from 'react';
import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import {View} from 'react-native';
import type {OnyxCollection, OnyxEntry} from 'react-native-onyx';
import {useOnyx} from 'react-native-onyx';
import type {SvgProps} from 'react-native-svg';
import ConfirmModal from '@components/ConfirmModal';
import FloatingActionButton from '@components/FloatingActionButton';
import * as Expensicons from '@components/Icon/Expensicons';
import type {PopoverMenuItem} from '@components/PopoverMenu';
import PopoverMenu from '@components/PopoverMenu';
import Text from '@components/Text';
import useEnvironment from '@hooks/useEnvironment';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import usePermissions from '@hooks/usePermissions';
import usePrevious from '@hooks/usePrevious';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import useWindowDimensions from '@hooks/useWindowDimensions';
import getIconForAction from '@libs/getIconForAction';
import interceptAnonymousUser from '@libs/interceptAnonymousUser';
import getTopmostCentralPaneRoute from '@libs/Navigation/getTopmostCentralPaneRoute';
import Navigation from '@libs/Navigation/Navigation';
import type {CentralPaneName, NavigationPartialRoute, RootStackParamList} from '@libs/Navigation/types';
import {hasSeenTourSelector} from '@libs/onboardingSelectors';
import * as PolicyUtils from '@libs/PolicyUtils';
import * as ReportUtils from '@libs/ReportUtils';
import * as SubscriptionUtils from '@libs/SubscriptionUtils';
import {getNavatticURL} from '@libs/TourUtils';
import variables from '@styles/variables';
import * as App from '@userActions/App';
import * as IOU from '@userActions/IOU';
import * as Link from '@userActions/Link';
import * as Report from '@userActions/Report';
import * as Task from '@userActions/Task';
import * as Welcome from '@userActions/Welcome';
import CONST from '@src/CONST';
import type {TranslationPaths} from '@src/languages/types';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import SCREENS from '@src/SCREENS';
import type * as OnyxTypes from '@src/types/onyx';
import type {QuickActionName} from '@src/types/onyx/QuickAction';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import mapOnyxCollectionItems from '@src/utils/mapOnyxCollectionItems';

// On small screen we hide the search page from central pane to show the search bottom tab page with bottom tab bar.
// We need to take this in consideration when checking if the screen is focused.
const useIsFocused = () => {
    const {shouldUseNarrowLayout} = useResponsiveLayout();
    const isFocused = useIsFocusedOriginal();
    const topmostCentralPane = useNavigationState<RootStackParamList, NavigationPartialRoute<CentralPaneName> | undefined>(getTopmostCentralPaneRoute);
    return isFocused || (topmostCentralPane?.name === SCREENS.SEARCH.CENTRAL_PANE && shouldUseNarrowLayout);
};

type PolicySelector = Pick<OnyxTypes.Policy, 'type' | 'role' | 'isPolicyExpenseChatEnabled' | 'pendingAction' | 'avatarURL' | 'name' | 'id' | 'areInvoicesEnabled'>;

type FloatingActionButtonAndPopoverProps = {
    /* Callback function when the menu is shown */
    onShowCreateMenu?: () => void;

    /* Callback function before the menu is hidden */
    onHideCreateMenu?: () => void;
};

type FloatingActionButtonAndPopoverRef = {
    hideCreateMenu: () => void;
};

const policySelector = (policy: OnyxEntry<OnyxTypes.Policy>): PolicySelector =>
    (policy && {
        type: policy.type,
        role: policy.role,
        id: policy.id,
        isPolicyExpenseChatEnabled: policy.isPolicyExpenseChatEnabled,
        pendingAction: policy.pendingAction,
        avatarURL: policy.avatarURL,
        name: policy.name,
        areInvoicesEnabled: policy.areInvoicesEnabled,
    }) as PolicySelector;

const getQuickActionIcon = (action: QuickActionName): React.FC<SvgProps> => {
    switch (action) {
        case CONST.QUICK_ACTIONS.REQUEST_MANUAL:
            return getIconForAction(CONST.IOU.TYPE.REQUEST);
        case CONST.QUICK_ACTIONS.REQUEST_SCAN:
            return Expensicons.ReceiptScan;
        case CONST.QUICK_ACTIONS.REQUEST_DISTANCE:
            return Expensicons.Car;
        case CONST.QUICK_ACTIONS.SPLIT_MANUAL:
        case CONST.QUICK_ACTIONS.SPLIT_SCAN:
        case CONST.QUICK_ACTIONS.SPLIT_DISTANCE:
            return getIconForAction(CONST.IOU.TYPE.SPLIT);
        case CONST.QUICK_ACTIONS.SEND_MONEY:
            return getIconForAction(CONST.IOU.TYPE.SEND);
        case CONST.QUICK_ACTIONS.ASSIGN_TASK:
            return Expensicons.Task;
        case CONST.QUICK_ACTIONS.TRACK_DISTANCE:
            return Expensicons.Car;
        case CONST.QUICK_ACTIONS.TRACK_MANUAL:
            return getIconForAction(CONST.IOU.TYPE.TRACK);
        case CONST.QUICK_ACTIONS.TRACK_SCAN:
            return Expensicons.ReceiptScan;
        default:
            return Expensicons.MoneyCircle;
    }
};

const getQuickActionTitle = (action: QuickActionName): TranslationPaths => {
    switch (action) {
        case CONST.QUICK_ACTIONS.REQUEST_MANUAL:
            return 'quickAction.requestMoney';
        case CONST.QUICK_ACTIONS.REQUEST_SCAN:
            return 'quickAction.scanReceipt';
        case CONST.QUICK_ACTIONS.REQUEST_DISTANCE:
            return 'quickAction.recordDistance';
        case CONST.QUICK_ACTIONS.SPLIT_MANUAL:
            return 'quickAction.splitBill';
        case CONST.QUICK_ACTIONS.SPLIT_SCAN:
            return 'quickAction.splitScan';
        case CONST.QUICK_ACTIONS.SPLIT_DISTANCE:
            return 'quickAction.splitDistance';
        case CONST.QUICK_ACTIONS.TRACK_MANUAL:
            return 'quickAction.trackManual';
        case CONST.QUICK_ACTIONS.TRACK_SCAN:
            return 'quickAction.trackScan';
        case CONST.QUICK_ACTIONS.TRACK_DISTANCE:
            return 'quickAction.trackDistance';
        case CONST.QUICK_ACTIONS.SEND_MONEY:
            return 'quickAction.paySomeone';
        case CONST.QUICK_ACTIONS.ASSIGN_TASK:
            return 'quickAction.assignTask';
        default:
            return '' as TranslationPaths;
    }
};

/**
 * Responsible for rendering the {@link PopoverMenu}, and the accompanying
 * FAB that can open or close the menu.
 */
function FloatingActionButtonAndPopover({onHideCreateMenu, onShowCreateMenu}: FloatingActionButtonAndPopoverProps, ref: ForwardedRef<FloatingActionButtonAndPopoverRef>) {
    const styles = useThemeStyles();
    const theme = useTheme();
    const {translate} = useLocalize();
    const [isLoading = false] = useOnyx(ONYXKEYS.IS_LOADING_APP);
    const [personalDetails] = useOnyx(ONYXKEYS.PERSONAL_DETAILS_LIST);
    const [session] = useOnyx(ONYXKEYS.SESSION);
    const [quickAction] = useOnyx(ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE);
    const [quickActionReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${quickAction?.chatReportID}`);
    const [reportNameValuePairs] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT_NAME_VALUE_PAIRS}${quickActionReport?.reportID ?? -1}`);
    const [activePolicyID] = useOnyx(ONYXKEYS.NVP_ACTIVE_POLICY_ID);
    const [allReports] = useOnyx(ONYXKEYS.COLLECTION.REPORT);
    const [activePolicy] = useOnyx(`${ONYXKEYS.COLLECTION.POLICY}${activePolicyID}`);
    const policyChatForActivePolicy = useMemo(() => {
        if (isEmptyObject(activePolicy) || !activePolicy?.isPolicyExpenseChatEnabled) {
            return {} as OnyxTypes.Report;
        }
        const policyChatsForActivePolicy = ReportUtils.getWorkspaceChats(activePolicyID ?? '-1', [session?.accountID ?? -1], allReports);
        return policyChatsForActivePolicy.length > 0 ? policyChatsForActivePolicy.at(0) : ({} as OnyxTypes.Report);
    }, [activePolicy, activePolicyID, session?.accountID, allReports]);
    const [quickActionPolicy] = useOnyx(`${ONYXKEYS.COLLECTION.POLICY}${quickActionReport?.policyID}`);
    const [allPolicies] = useOnyx(ONYXKEYS.COLLECTION.POLICY, {selector: (c) => mapOnyxCollectionItems(c, policySelector)});
    const [hasSeenTrackTraining] = useOnyx(ONYXKEYS.NVP_HAS_SEEN_TRACK_TRAINING);

    const [isCreateMenuActive, setIsCreateMenuActive] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const fabRef = useRef<HTMLDivElement>(null);
    const {windowHeight} = useWindowDimensions();
    const {shouldUseNarrowLayout} = useResponsiveLayout();
    const isFocused = useIsFocused();
    const prevIsFocused = usePrevious(isFocused);
    const {isOffline} = useNetwork();

    const {canUseSpotnanaTravel, canUseCombinedTrackSubmit} = usePermissions();
    const canSendInvoice = useMemo(() => PolicyUtils.canSendInvoice(allPolicies as OnyxCollection<OnyxTypes.Policy>, session?.email), [allPolicies, session?.email]);
    const isValidReport = !(isEmptyObject(quickActionReport) || ReportUtils.isArchivedRoom(quickActionReport, reportNameValuePairs));
    const {environment} = useEnvironment();
    const [introSelected] = useOnyx(ONYXKEYS.NVP_INTRO_SELECTED);
    const navatticURL = getNavatticURL(environment, introSelected?.choice);
    const [hasSeenTour = false] = useOnyx(ONYXKEYS.NVP_ONBOARDING, {
        selector: hasSeenTourSelector,
    });
    /**
     * There are scenarios where users who have not yet had their group workspace-chats in NewDot (isPolicyExpenseChatEnabled). In those scenarios, things can get confusing if they try to submit/track expenses. To address this, we block them from Creating, Tracking, Submitting expenses from NewDot if they are:
     * 1. on at least one group policy
     * 2. none of the group policies they are a member of have isPolicyExpenseChatEnabled=true
     */
    const shouldRedirectToExpensifyClassic = useMemo(() => {
        return PolicyUtils.areAllGroupPoliciesExpenseChatDisabled((allPolicies as OnyxCollection<OnyxTypes.Policy>) ?? {});
    }, [allPolicies]);

    const shouldShowNewWorkspaceButton = Object.values(allPolicies ?? {}).every(
        (policy) => !PolicyUtils.shouldShowPolicy(policy as OnyxEntry<OnyxTypes.Policy>, !!isOffline, session?.email),
    );

    const quickActionAvatars = useMemo(() => {
        if (isValidReport) {
            const avatars = ReportUtils.getIcons(quickActionReport, personalDetails);
            return avatars.length <= 1 || ReportUtils.isPolicyExpenseChat(quickActionReport) ? avatars : avatars.filter((avatar) => avatar.id !== session?.accountID);
        }
        if (!isEmptyObject(policyChatForActivePolicy)) {
            return ReportUtils.getIcons(policyChatForActivePolicy, personalDetails);
        }
        return [];
        // Policy is needed as a dependency in order to update the shortcut details when the workspace changes
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
    }, [personalDetails, session?.accountID, quickActionReport, quickActionPolicy, policyChatForActivePolicy]);

    const renderQuickActionTooltip = useCallback(
        () => (
            <Text>
                <Text style={styles.quickActionTooltipTitle}>{translate('quickAction.tooltip.title')}</Text>
                <Text style={styles.quickActionTooltipSubtitle}>{translate('quickAction.tooltip.subtitle')}</Text>
            </Text>
        ),
        [styles.quickActionTooltipTitle, styles.quickActionTooltipSubtitle, translate],
    );

    const quickActionTitle = useMemo(() => {
        if (isEmptyObject(quickActionReport)) {
            return '';
        }
        if (quickAction?.action === CONST.QUICK_ACTIONS.SEND_MONEY && quickActionAvatars.length > 0) {
            const name: string = ReportUtils.getDisplayNameForParticipant(+(quickActionAvatars.at(0)?.id ?? -1), true) ?? '';
            return translate('quickAction.paySomeone', {name});
        }
        const titleKey = getQuickActionTitle(quickAction?.action ?? ('' as QuickActionName));
        return titleKey ? translate(titleKey) : '';
    }, [quickAction, translate, quickActionAvatars, quickActionReport]);

    const hideQABSubtitle = useMemo(() => {
        if (!isValidReport) {
            return true;
        }
        if (quickActionAvatars.length === 0) {
            return false;
        }
        const displayName = personalDetails?.[quickActionAvatars.at(0)?.id ?? -1]?.firstName ?? '';
        return quickAction?.action === CONST.QUICK_ACTIONS.SEND_MONEY && displayName.length === 0;
    }, [isValidReport, quickActionAvatars, personalDetails, quickAction?.action]);

    const selectOption = useCallback(
        (onSelected: () => void, shouldRestrictAction: boolean) => {
            if (shouldRestrictAction && quickActionReport?.policyID && SubscriptionUtils.shouldRestrictUserBillableActions(quickActionReport.policyID)) {
                Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(quickActionReport.policyID));
                return;
            }
            onSelected();
        },
        [quickActionReport?.policyID],
    );

    const navigateToQuickAction = useCallback(() => {
        const quickActionReportID = isValidReport ? quickActionReport?.reportID ?? '-1' : ReportUtils.generateReportID();

        switch (quickAction?.action) {
            case CONST.QUICK_ACTIONS.REQUEST_MANUAL:
            case CONST.QUICK_ACTIONS.REQUEST_SCAN:
            case CONST.QUICK_ACTIONS.REQUEST_DISTANCE:
                selectOption(() => IOU.startMoneyRequest(CONST.IOU.TYPE.SUBMIT, quickActionReportID, undefined, true), true);
                return;
            case CONST.QUICK_ACTIONS.SPLIT_MANUAL:
            case CONST.QUICK_ACTIONS.SPLIT_SCAN:
                selectOption(() => IOU.startMoneyRequest(CONST.IOU.TYPE.SPLIT, quickActionReportID, undefined, true), true);
                return;
            case CONST.QUICK_ACTIONS.SPLIT_DISTANCE:
                selectOption(() => IOU.startMoneyRequest(CONST.IOU.TYPE.SPLIT, quickActionReportID, undefined, false), true);
                return;
            case CONST.QUICK_ACTIONS.SEND_MONEY:
                selectOption(() => IOU.startMoneyRequest(CONST.IOU.TYPE.PAY, quickActionReportID, undefined, true), false);
                return;
            case CONST.QUICK_ACTIONS.ASSIGN_TASK:
                selectOption(() => Task.startOutCreateTaskQuickAction(isValidReport ? quickActionReportID : '', quickAction.targetAccountID ?? -1), false);
                break;
            case CONST.QUICK_ACTIONS.TRACK_MANUAL:
            case CONST.QUICK_ACTIONS.TRACK_SCAN:
            case CONST.QUICK_ACTIONS.TRACK_DISTANCE:
                selectOption(() => IOU.startMoneyRequest(CONST.IOU.TYPE.TRACK, quickActionReportID, undefined, true), false);
                break;
            default:
        }
    }, [isValidReport, quickAction?.action, quickAction?.targetAccountID, quickActionReport?.reportID, selectOption]);

    /**
     * Check if LHN status changed from active to inactive.
     * Used to close already opened FAB menu when open any other pages (i.e. Press Command + K on web).
     */
    const didScreenBecomeInactive = useCallback(
        (): boolean =>
            // When any other page is opened over LHN
            !isFocused && prevIsFocused,
        [isFocused, prevIsFocused],
    );

    /**
     * Method called when we click the floating action button
     */
    const showCreateMenu = useCallback(
        () => {
            if (!isFocused && shouldUseNarrowLayout) {
                return;
            }
            setIsCreateMenuActive(true);
            onShowCreateMenu?.();
        },
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [isFocused, shouldUseNarrowLayout],
    );

    /**
     * Method called either when:
     * - Pressing the floating action button to open the CreateMenu modal
     * - Selecting an item on CreateMenu or closing it by clicking outside of the modal component
     */
    const hideCreateMenu = useCallback(
        () => {
            if (!isCreateMenuActive) {
                return;
            }
            setIsCreateMenuActive(false);
            onHideCreateMenu?.();
        },
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [isCreateMenuActive],
    );

    useEffect(() => {
        if (!didScreenBecomeInactive()) {
            return;
        }

        // Hide menu manually when other pages are opened using shortcut key
        hideCreateMenu();
    }, [didScreenBecomeInactive, hideCreateMenu]);

    useImperativeHandle(ref, () => ({
        hideCreateMenu() {
            hideCreateMenu();
        },
    }));

    const toggleCreateMenu = () => {
        if (isCreateMenuActive) {
            hideCreateMenu();
        } else {
            showCreateMenu();
        }
    };

    // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
    const selfDMReportID = useMemo(() => ReportUtils.findSelfDMReportID(), [isLoading, isCreateMenuActive]);

    const expenseMenuItems = useMemo((): PopoverMenuItem[] => {
        if (canUseCombinedTrackSubmit) {
            return [
                {
                    icon: getIconForAction(CONST.IOU.TYPE.CREATE),
                    text: translate('iou.createExpense'),
                    shouldCallAfterModalHide: shouldRedirectToExpensifyClassic,
                    onSelected: () =>
                        interceptAnonymousUser(() => {
                            if (shouldRedirectToExpensifyClassic) {
                                setModalVisible(true);
                                return;
                            }
                            IOU.startMoneyRequest(
                                CONST.IOU.TYPE.CREATE,
                                // When starting to create an expense from the global FAB, there is not an existing report yet. A random optimistic reportID is generated and used
                                // for all of the routes in the creation flow.
                                ReportUtils.generateReportID(),
                            );
                        }),
                },
            ];
        }

        return [
            ...(selfDMReportID
                ? [
                      {
                          icon: getIconForAction(CONST.IOU.TYPE.TRACK),
                          text: translate('iou.trackExpense'),
                          shouldCallAfterModalHide: shouldRedirectToExpensifyClassic,
                          onSelected: () => {
                              if (shouldRedirectToExpensifyClassic) {
                                  setModalVisible(true);
                                  return;
                              }
                              interceptAnonymousUser(() => {
                                  IOU.startMoneyRequest(
                                      CONST.IOU.TYPE.TRACK,
                                      // When starting to create a track expense from the global FAB, we need to retrieve selfDM reportID.
                                      // If it doesn't exist, we generate a random optimistic reportID and use it for all of the routes in the creation flow.
                                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                                      ReportUtils.findSelfDMReportID() || ReportUtils.generateReportID(),
                                  );
                              });
                              if (!hasSeenTrackTraining && !isOffline) {
                                  setTimeout(() => {
                                      Navigation.navigate(ROUTES.TRACK_TRAINING_MODAL);
                                  }, CONST.ANIMATED_TRANSITION);
                              }
                          },
                      },
                  ]
                : []),
            {
                icon: getIconForAction(CONST.IOU.TYPE.REQUEST),
                text: translate('iou.submitExpense'),
                shouldCallAfterModalHide: shouldRedirectToExpensifyClassic,
                onSelected: () =>
                    interceptAnonymousUser(() => {
                        if (shouldRedirectToExpensifyClassic) {
                            setModalVisible(true);
                            return;
                        }

                        IOU.startMoneyRequest(
                            CONST.IOU.TYPE.SUBMIT,
                            // When starting to create an expense from the global FAB, there is not an existing report yet. A random optimistic reportID is generated and used
                            // for all of the routes in the creation flow.
                            ReportUtils.generateReportID(),
                        );
                    }),
            },
        ];
    }, [canUseCombinedTrackSubmit, translate, selfDMReportID, hasSeenTrackTraining, isOffline, shouldRedirectToExpensifyClassic]);

    const quickActionMenuItems = useMemo(() => {
        // Define common properties in baseQuickAction
        const baseQuickAction = {
            label: translate('quickAction.header'),
            isLabelHoverable: false,
            floatRightAvatars: quickActionAvatars,
            floatRightAvatarSize: CONST.AVATAR_SIZE.SMALL,
            numberOfLinesDescription: 1,
            tooltipAnchorAlignment: {
                vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
                horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.LEFT,
            },
            tooltipShiftHorizontal: styles.popoverMenuItem.paddingHorizontal,
            tooltipShiftVertical: styles.popoverMenuItem.paddingVertical / 2,
            renderTooltipContent: renderQuickActionTooltip,
            tooltipWrapperStyle: styles.quickActionTooltipWrapper,
        };

        if (quickAction?.action) {
            return [
                {
                    ...baseQuickAction,
                    icon: getQuickActionIcon(quickAction?.action),
                    text: quickActionTitle,
                    description: !hideQABSubtitle ? ReportUtils.getReportName(quickActionReport) ?? translate('quickAction.updateDestination') : '',
                    onSelected: () => interceptAnonymousUser(() => navigateToQuickAction()),
                    shouldShowSubscriptRightAvatar: ReportUtils.isPolicyExpenseChat(quickActionReport),
                    shouldRenderTooltip: quickAction.isFirstQuickAction,
                },
            ];
        }
        if (!isEmptyObject(policyChatForActivePolicy)) {
            return [
                {
                    ...baseQuickAction,
                    icon: Expensicons.ReceiptScan,
                    text: translate('quickAction.scanReceipt'),
                    description: ReportUtils.getReportName(policyChatForActivePolicy),
                    onSelected: () =>
                        interceptAnonymousUser(() => {
                            selectOption(() => {
                                const quickActionReportID = isValidReport ? policyChatForActivePolicy?.reportID ?? '-1' : ReportUtils.generateReportID();
                                IOU.startMoneyRequest(CONST.IOU.TYPE.SUBMIT, quickActionReportID ?? '-1', CONST.IOU.REQUEST_TYPE.SCAN, true);
                            }, true);
                        }),
                    shouldShowSubscriptRightAvatar: true,
                    shouldRenderTooltip: false,
                },
            ];
        }

        return [];
    }, [
        translate,
        quickActionAvatars,
        styles.popoverMenuItem.paddingHorizontal,
        styles.popoverMenuItem.paddingVertical,
        styles.quickActionTooltipWrapper,
        renderQuickActionTooltip,
        quickAction?.action,
        quickAction?.isFirstQuickAction,
        policyChatForActivePolicy,
        quickActionTitle,
        hideQABSubtitle,
        quickActionReport,
        navigateToQuickAction,
        selectOption,
        isValidReport,
    ]);

    const viewTourTaskReportID = introSelected?.viewTour;
    const [viewTourTaskReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${viewTourTaskReportID}`);

    return (
        <View style={styles.flexGrow1}>
            <PopoverMenu
                onClose={hideCreateMenu}
                isVisible={isCreateMenuActive && (!shouldUseNarrowLayout || isFocused)}
                anchorPosition={styles.createMenuPositionSidebar(windowHeight)}
                onItemSelected={hideCreateMenu}
                fromSidebarMediumScreen={!shouldUseNarrowLayout}
                menuItems={[
                    {
                        icon: Expensicons.ChatBubble,
                        text: translate('sidebarScreen.fabNewChat'),
                        onSelected: () => interceptAnonymousUser(Report.startNewChat),
                    },
                    ...expenseMenuItems,
                    ...(canSendInvoice
                        ? [
                              {
                                  icon: Expensicons.InvoiceGeneric,
                                  text: translate('workspace.invoices.sendInvoice'),
                                  shouldCallAfterModalHide: shouldRedirectToExpensifyClassic,
                                  onSelected: () =>
                                      interceptAnonymousUser(() => {
                                          if (shouldRedirectToExpensifyClassic) {
                                              setModalVisible(true);
                                              return;
                                          }

                                          IOU.startMoneyRequest(
                                              CONST.IOU.TYPE.INVOICE,
                                              // When starting to create an invoice from the global FAB, there is not an existing report yet. A random optimistic reportID is generated and used
                                              // for all of the routes in the creation flow.
                                              ReportUtils.generateReportID(),
                                          );
                                      }),
                              },
                          ]
                        : []),
                    ...(canUseSpotnanaTravel
                        ? [
                              {
                                  icon: Expensicons.Suitcase,
                                  text: translate('travel.bookTravel'),
                                  onSelected: () => interceptAnonymousUser(() => Navigation.navigate(ROUTES.TRAVEL_MY_TRIPS)),
                              },
                          ]
                        : []),
                    ...(!hasSeenTour
                        ? [
                              {
                                  icon: Expensicons.Binoculars,
                                  iconStyles: styles.popoverIconCircle,
                                  iconFill: theme.icon,
                                  text: translate('tour.takeATwoMinuteTour'),
                                  description: translate('tour.exploreExpensify'),
                                  onSelected: () => {
                                      Welcome.setSelfTourViewed();
                                      Link.openExternalLink(navatticURL);
                                      Task.completeTask(viewTourTaskReport);
                                  },
                              },
                          ]
                        : []),
                    ...(!isLoading && shouldShowNewWorkspaceButton
                        ? [
                              {
                                  displayInDefaultIconColor: true,
                                  contentFit: 'contain' as ImageContentFit,
                                  icon: Expensicons.NewWorkspace,
                                  iconWidth: variables.w46,
                                  iconHeight: variables.h40,
                                  text: translate('workspace.new.newWorkspace'),
                                  description: translate('workspace.new.getTheExpensifyCardAndMore'),
                                  onSelected: () => interceptAnonymousUser(() => App.createWorkspaceWithPolicyDraftAndNavigateToIt()),
                              },
                          ]
                        : []),
                    ...quickActionMenuItems,
                ]}
                withoutOverlay
                anchorRef={fabRef}
            />
            <ConfirmModal
                prompt={translate('sidebarScreen.redirectToExpensifyClassicModal.description')}
                isVisible={modalVisible}
                onConfirm={() => {
                    setModalVisible(false);
                    Link.openOldDotLink(CONST.OLDDOT_URLS.INBOX);
                }}
                onCancel={() => setModalVisible(false)}
                title={translate('sidebarScreen.redirectToExpensifyClassicModal.title')}
                confirmText={translate('exitSurvey.goToExpensifyClassic')}
                cancelText={translate('common.cancel')}
            />
            <FloatingActionButton
                accessibilityLabel={translate('sidebarScreen.fabNewChatExplained')}
                role={CONST.ROLE.BUTTON}
                isActive={isCreateMenuActive}
                ref={fabRef}
                onPress={toggleCreateMenu}
            />
        </View>
    );
}

FloatingActionButtonAndPopover.displayName = 'FloatingActionButtonAndPopover';

export default forwardRef(FloatingActionButtonAndPopover);

export type {PolicySelector};
