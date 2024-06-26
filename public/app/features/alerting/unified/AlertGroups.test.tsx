import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TestProvider } from 'test/helpers/TestProvider';
import { byRole, byTestId, byText } from 'testing-library-selector';

import { selectors } from '@grafana/e2e-selectors';
import { setDataSourceSrv } from '@grafana/runtime';
import { AccessControlAction } from 'app/types';

import AlertGroups from './AlertGroups';
import { fetchAlertGroups } from './api/alertmanager';
import {
  grantUserPermissions,
  mockAlertGroup,
  mockAlertmanagerAlert,
  mockDataSource,
  MockDataSourceSrv,
} from './mocks';
import { AlertmanagerProvider } from './state/AlertmanagerContext';
import { DataSourceType } from './utils/datasource';

jest.mock('./api/alertmanager');
const mocks = {
  api: {
    fetchAlertGroups: jest.mocked(fetchAlertGroups),
  },
};

const renderAmNotifications = () => {
  return render(
    <TestProvider>
      <AlertmanagerProvider accessType={'instance'}>
        <AlertGroups />
      </AlertmanagerProvider>
    </TestProvider>
  );
};

const dataSources = {
  am: mockDataSource({
    name: 'Alertmanager',
    type: DataSourceType.Alertmanager,
  }),
};

const ui = {
  group: byTestId('alert-group'),
  groupCollapseToggle: byTestId('alert-group-collapse-toggle'),
  groupTable: byTestId('alert-group-table'),
  row: byTestId('row'),
  collapseToggle: byTestId(selectors.components.AlertRules.toggle),
  silenceButton: byText('Silence'),
  sourceButton: byText('See source'),
  matcherInput: byTestId('search-query-input'),
  groupByContainer: byTestId('group-by-container'),
  groupByInput: byRole('combobox', { name: /group by label keys/i }),
  clearButton: byRole('button', { name: 'Clear filters' }),
};

describe('AlertGroups', () => {
  beforeAll(() => {
    grantUserPermissions([
      AccessControlAction.AlertingInstanceRead,
      AccessControlAction.AlertingInstanceCreate,
      AccessControlAction.AlertingInstancesExternalRead,
      AccessControlAction.AlertingRuleRead,
    ]);

    mocks.api.fetchAlertGroups.mockImplementation(() => {
      return Promise.resolve([
        mockAlertGroup({ labels: {}, alerts: [mockAlertmanagerAlert({ labels: { foo: 'bar' } })] }),
        mockAlertGroup(),
      ]);
    });
  });

  beforeEach(() => {
    setDataSourceSrv(new MockDataSourceSrv(dataSources));
  });

  it('loads and shows groups', async () => {
    renderAmNotifications();

    await waitFor(() => expect(mocks.api.fetchAlertGroups).toHaveBeenCalled());

    const groups = await ui.group.findAll();

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('No grouping');
    expect(groups[1]).toHaveTextContent('severitywarning regionUS-Central');

    await userEvent.click(ui.groupCollapseToggle.get(groups[0]));
    expect(ui.groupTable.get()).toBeDefined();

    await userEvent.click(ui.collapseToggle.get(ui.groupTable.get()));
    expect(ui.silenceButton.get(ui.groupTable.get())).toBeDefined();
    expect(ui.sourceButton.get(ui.groupTable.get())).toBeDefined();
  });

  it('should group by custom grouping', async () => {
    const regions = ['NASA', 'EMEA', 'APAC'];
    mocks.api.fetchAlertGroups.mockImplementation(() => {
      const groups = regions.map((region) =>
        mockAlertGroup({
          labels: { region },
          alerts: [
            mockAlertmanagerAlert({ labels: { region, appName: 'billing', env: 'production' } }),
            mockAlertmanagerAlert({ labels: { region, appName: 'auth', env: 'staging', uniqueLabel: 'true' } }),
            mockAlertmanagerAlert({ labels: { region, appName: 'frontend', env: 'production' } }),
          ],
        })
      );
      return Promise.resolve(groups);
    });

    renderAmNotifications();
    await waitFor(() => expect(mocks.api.fetchAlertGroups).toHaveBeenCalled());
    let groups = await ui.group.findAll();
    const groupByInput = ui.groupByInput.get();
    const groupByWrapper = ui.groupByContainer.get();

    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveTextContent('regionNASA');
    expect(groups[1]).toHaveTextContent('regionEMEA');
    expect(groups[2]).toHaveTextContent('regionAPAC');

    await userEvent.type(groupByInput, 'appName{enter}');

    await waitFor(() => expect(groupByWrapper).toHaveTextContent('appName'));

    groups = await ui.group.findAll();

    await waitFor(() => expect(ui.clearButton.get()).toBeInTheDocument());
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveTextContent('appNamebilling');
    expect(groups[1]).toHaveTextContent('appNameauth');
    expect(groups[2]).toHaveTextContent('appNamefrontend');

    await userEvent.click(ui.clearButton.get());
    await waitFor(() => expect(groupByWrapper).not.toHaveTextContent('appName'));

    await userEvent.type(groupByInput, 'env{enter}');
    await waitFor(() => expect(groupByWrapper).toHaveTextContent('env'));

    groups = await ui.group.findAll();

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('envproduction');
    expect(groups[1]).toHaveTextContent('envstaging');

    await userEvent.click(ui.clearButton.get());
    await waitFor(() => expect(groupByWrapper).not.toHaveTextContent('env'));

    await userEvent.type(groupByInput, 'uniqueLabel{enter}');
    await waitFor(() => expect(groupByWrapper).toHaveTextContent('uniqueLabel'));

    groups = await ui.group.findAll();
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('No grouping');
    expect(groups[1]).toHaveTextContent('uniqueLabeltrue');
  });

  it('should combine multiple ungrouped groups', async () => {
    mocks.api.fetchAlertGroups.mockImplementation(() => {
      const groups = [
        mockAlertGroup({ labels: {} }),
        mockAlertGroup({ labels: {}, alerts: [mockAlertmanagerAlert({ labels: { foo: 'bar' } })] }),
      ];
      return Promise.resolve(groups);
    });
    renderAmNotifications();
    await waitFor(() => {
      expect(ui.group.getAll()).toHaveLength(1);
    });
  });
});
