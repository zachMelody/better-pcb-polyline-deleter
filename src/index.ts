/**
 * 入口文件
 *
 * 本文件为默认扩展入口文件，如果你想要配置其它文件作为入口文件，
 * 请修改 `extension.json` 中的 `entry` 字段；
 *
 * 请在此处使用 `export`  导出所有你希望在 `headerMenus` 中引用的方法，
 * 方法通过方法名与 `headerMenus` 关联。
 *
 * 如需了解更多开发细节，请阅读：
 * https://prodocs.lceda.cn/cn/api/guide/
 */
import type { IPCB_Primitive, IPCB_PrimitiveComponent, IPCB_PrimitiveComponentPad } from '@jlceda/pro-api-types';
import * as extensionConfig from '../extension.json';

// eslint-disable-next-line unused-imports/no-unused-vars
export function activate(status?: 'onStartupFinished', arg?: string): void {}

export function about(): void {
	eda.sys_Dialog.showInformationMessage(
		eda.sys_I18n.text('EasyEDA extension SDK v', undefined, undefined, extensionConfig.version),
		eda.sys_I18n.text('About'),
	);
}

/**
 * 判断图元是否为元件类型
 */
function isComponent(primitive: IPCB_Primitive): primitive is IPCB_PrimitiveComponent {
	return primitive.getState_PrimitiveType() === 'Component';
}

/**
 * 删除与选中元件连接的指定网络走线
 *
 * 工作流程:
 * 1. 获取选中的 PCB 元件
 * 2. 遍历元件的所有焊盘，收集网络名称
 * 3. 弹出多选对话框，让用户选择要删除的网络
 * 4. 弹出确认对话框，显示已选网络
 * 5. 用户确认后删除走线
 */
export async function deleteConnectedTracesForSelected(): Promise<void> {
	try {
		const selectedPrimitives = await eda.pcb_SelectControl.getAllSelectedPrimitives();

		if (!selectedPrimitives || selectedPrimitives.length === 0) {
			eda.sys_Dialog.showInformationMessage('请先选中需要处理的元件', '删除导线');
			return;
		}

		const selectedComponents = selectedPrimitives.filter(isComponent);

		if (selectedComponents.length === 0) {
			eda.sys_Dialog.showInformationMessage('选中的图元中没有元件，请选中 PCB 元件', '删除导线');
			return;
		}

		// 收集所有焊盘的网络名称
		const netNames = new Set<string>();
		const padsByNet = new Map<string, IPCB_PrimitiveComponentPad[]>();

		for (const component of selectedComponents) {
			const componentId = component.getState_PrimitiveId();

			const pads = await eda.pcb_PrimitiveComponent.getAllPinsByPrimitiveId(componentId);
			if (!pads || pads.length === 0) {
				continue;
			}

			for (const pad of pads) {
				const netName = (pad as IPCB_PrimitiveComponentPad).getState_Net();
				if (netName) {
					netNames.add(netName);
					if (!padsByNet.has(netName)) {
						padsByNet.set(netName, []);
					}
					padsByNet.get(netName)!.push(pad as IPCB_PrimitiveComponentPad);
				}
			}
		}

		if (netNames.size === 0) {
			eda.sys_Dialog.showInformationMessage('选中的元件没有连接任何网络', '删除导线');
			return;
		}

		// 按网络名称排序
		const sortedNetNames = Array.from(netNames).sort((a, b) => a.localeCompare(b));

		// 弹出多选对话框
		eda.sys_Dialog.showSelectDialog(
			sortedNetNames,
			'选择要删除走线的网络:',
			'不选择即删除所有连接的网络走线',
			'选择网络',
			sortedNetNames,
			true,
			(selectedNets: string[]) => {
				if (!selectedNets || selectedNets.length === 0) {
					eda.sys_Dialog.showInformationMessage('未选择任何网络', '删除导线');
					return;
				}

				// 延迟弹出确认对话框，避免与选择对话框冲突
				setTimeout(() => {
					const confirmContent = `确定要删除以下 ${selectedNets.length} 个网络的走线吗？\n\n${selectedNets.join('\n')}`;
					eda.sys_Dialog.showConfirmationMessage(
						confirmContent,
						'确认删除',
						'删除',
						'取消',
						async (confirmed: boolean) => {
							if (confirmed) {
								await deleteTracesForNets(selectedNets, padsByNet);
							}
						},
					);
				}, 100);
			},
		);
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		eda.sys_Dialog.showInformationMessage(`删除导线失败: ${errorMessage}`, '删除导线');
	}
}

/**
 * 删除指定网络上与元件焊盘连接的走线
 */
async function deleteTracesForNets(
	nets: string[],
	padsByNet: Map<string, IPCB_PrimitiveComponentPad[]>,
): Promise<void> {
	try {
		const linesToDelete = new Set<string>();
		const arcsToDelete = new Set<string>();

		for (const net of nets) {
			const pads = padsByNet.get(net);
			if (!pads)
				continue;

			for (const pad of pads) {
				// 获取与焊盘直接连接的图元
				const connectedPrimitives = await pad.getConnectedPrimitives(false);
				if (!connectedPrimitives || connectedPrimitives.length === 0) {
					continue;
				}

				for (const primitive of connectedPrimitives) {
					const type = primitive.getState_PrimitiveType();
					const id = primitive.getState_PrimitiveId();

					if (type === 'Line') {
						// 获取整条走线
						const entireTrack = await primitive.getEntireTrack(false);
						if (entireTrack && entireTrack.length > 0) {
							for (const segment of entireTrack) {
								const segType = segment.getState_PrimitiveType();
								const segId = segment.getState_PrimitiveId();
								if (segType === 'Line') {
									linesToDelete.add(segId);
								}
								else if (segType === 'Arc') {
									arcsToDelete.add(segId);
								}
							}
						}
						else {
							linesToDelete.add(id);
						}
					}
					else if (type === 'Arc') {
						const entireTrack = await primitive.getEntireTrack(false);
						if (entireTrack && entireTrack.length > 0) {
							for (const segment of entireTrack) {
								const segType = segment.getState_PrimitiveType();
								const segId = segment.getState_PrimitiveId();
								if (segType === 'Line') {
									linesToDelete.add(segId);
								}
								else if (segType === 'Arc') {
									arcsToDelete.add(segId);
								}
							}
						}
						else {
							arcsToDelete.add(id);
						}
					}
				}
			}
		}

		const totalCount = linesToDelete.size + arcsToDelete.size;

		if (totalCount === 0) {
			eda.sys_Dialog.showInformationMessage('未发现与选中网络连接的导线', '删除导线');
			return;
		}

		// 按类型批量删除
		let deleteSuccess = true;

		if (linesToDelete.size > 0) {
			const result = await eda.pcb_PrimitiveLine.delete(Array.from(linesToDelete));
			if (!result)
				deleteSuccess = false;
		}

		if (arcsToDelete.size > 0) {
			const result = await eda.pcb_PrimitiveArc.delete(Array.from(arcsToDelete));
			if (!result)
				deleteSuccess = false;
		}

		if (deleteSuccess) {
			eda.sys_Dialog.showInformationMessage(
				`成功删除 ${totalCount} 条导线 (直线: ${linesToDelete.size}, 圆弧: ${arcsToDelete.size})`,
				'删除导线',
			);
		}
		else {
			eda.sys_Dialog.showInformationMessage(`部分删除失败，共处理 ${totalCount} 条导线`, '删除导线');
		}
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		eda.sys_Dialog.showInformationMessage(`删除导线失败: ${errorMessage}`, '删除导线');
	}
}
