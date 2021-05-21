import {
    Chain,
    Choice,
    IChainable,
    INextable
  } from 'aws-cdk-lib/aws-stepfunctions';
  
  export const partialChoiceAfterwards = (
    choice: Choice,
    ...leaves: INextable[]
  ): Chain => {
    return Chain.custom(
      choice,
      [new ChoiceDefaultAsNext(choice), ...leaves],
      choice
    );
  };
  
  export class ChoiceDefaultAsNext implements INextable {
    constructor(private readonly choice: Choice) {}
  
    public next(state: IChainable): Chain {
      this.choice.otherwise(state);
      return Chain.sequence(this.choice, state);
    }
  }
  